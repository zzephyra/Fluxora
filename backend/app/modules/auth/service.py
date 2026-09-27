from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.core.errors import AuthenticationError, DomainError, NotFoundError
from app.core.logging import get_logger
from app.infrastructure.db.session import UnitOfWork
from app.modules.auth.domain import UserStatus, normalize_email, validate_password
from app.modules.auth.models import User, UserSession
from app.modules.auth.passwords import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.modules.auth.repository import AuthRepository
from app.modules.auth.tokens import hash_token, hashes_match, new_token

logger = get_logger(__name__)


@dataclass(frozen=True)
class UserView:
    id: UUID
    email: str


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    session_id: UUID
    email: str
    csrf_token_hash: str
    expires_at: datetime


@dataclass(frozen=True)
class LoginResult:
    user_id: UUID
    email: str
    session_token: str
    csrf_token: str
    expires_at: datetime


@dataclass(frozen=True)
class IssuedCsrf:
    token: str
    max_age_seconds: int


class AuthService:
    def __init__(self, settings: Settings, repository: AuthRepository | None = None) -> None:
        self.settings = settings
        self.repository = repository or AuthRepository()

    async def create_user(self, uow: UnitOfWork, email: str, password: str) -> UserView:
        normalized = normalize_email(email)
        validate_password(password)
        existing = await self.repository.get_user_by_email(uow.session, normalized)
        if existing is not None:
            raise DomainError("Email is already registered")
        user = User(
            id=uuid4(),
            email_normalized=normalized,
            password_hash=hash_password(password),
            status=UserStatus.ACTIVE,
        )
        await self.repository.add_user(uow.session, user)
        try:
            await uow.session.flush()
            await uow.commit()
        except IntegrityError as exc:
            await uow.rollback()
            raise DomainError("Email is already registered") from exc
        logger.info("user_created", user_id=str(user.id))
        return UserView(id=user.id, email=user.email_normalized)

    async def login(
        self,
        uow: UnitOfWork,
        *,
        email: str,
        password: str,
        existing_session_token: str | None,
    ) -> LoginResult:
        normalized = normalize_email(email)
        validate_password(password)
        user = await self.repository.get_user_by_email(uow.session, normalized)
        password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
        password_ok = verify_password(password_hash, password)
        if user is None or user.status != UserStatus.ACTIVE or not password_ok:
            logger.info("login_failed")
            raise AuthenticationError("Authentication failed")
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        now = datetime.now(UTC)
        if existing_session_token:
            current = await self.repository.get_session_by_token_hash(
                uow.session,
                hash_token(existing_session_token),
            )
            if current is not None and current.revoked_at is None:
                current.revoked_at = now
        session_token = new_token()
        csrf_token = new_token()
        expires_at = now + timedelta(seconds=self.settings.session_ttl_seconds)
        await self.repository.add_session(
            uow.session,
            UserSession(
                id=uuid4(),
                user_id=user.id,
                token_hash=hash_token(session_token),
                csrf_token_hash=hash_token(csrf_token),
                expires_at=expires_at,
            ),
        )
        await uow.session.flush()
        await uow.commit()
        logger.info("login_succeeded", user_id=str(user.id))
        return LoginResult(
            user_id=user.id,
            email=user.email_normalized,
            session_token=session_token,
            csrf_token=csrf_token,
            expires_at=expires_at,
        )

    async def authenticate(self, uow: UnitOfWork, raw_session_token: str) -> Principal:
        row, user = await self._live_session(uow, raw_session_token)
        if row is None or user is None:
            raise AuthenticationError("Authentication required")
        return Principal(
            user_id=user.id,
            session_id=row.id,
            email=user.email_normalized,
            csrf_token_hash=row.csrf_token_hash,
            expires_at=row.expires_at,
        )

    async def presented_csrf_matches_live_session(
        self,
        uow: UnitOfWork,
        raw_session_token: str,
        csrf_token: str,
    ) -> bool:
        row, user = await self._live_session(uow, raw_session_token)
        if row is None or user is None:
            return False
        return hashes_match(csrf_token, row.csrf_token_hash)

    async def logout(self, uow: UnitOfWork, principal: Principal) -> None:
        row = await self.repository.get_session_by_id(uow.session, principal.session_id)
        if row is not None and row.revoked_at is None:
            row.revoked_at = datetime.now(UTC)
            await uow.session.flush()
        await uow.commit()
        logger.info("logout_succeeded", user_id=str(principal.user_id))

    async def rotate_csrf(self, uow: UnitOfWork, principal: Principal) -> IssuedCsrf:
        row = await self.repository.get_session_by_id(uow.session, principal.session_id)
        now = datetime.now(UTC)
        if row is None or not self._session_is_live(row, now):
            raise AuthenticationError("Authentication required")
        token = new_token()
        row.csrf_token_hash = hash_token(token)
        await uow.session.flush()
        await uow.commit()
        max_age = max(0, int((row.expires_at - now).total_seconds()))
        return IssuedCsrf(token=token, max_age_seconds=max_age)

    async def get_active_user(self, uow: UnitOfWork, user_id: UUID) -> UserView:
        user = await self.repository.get_user_by_id(uow.session, user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            raise NotFoundError("User was not found")
        return UserView(id=user.id, email=user.email_normalized)

    async def get_users_by_ids(
        self,
        uow: UnitOfWork,
        user_ids: list[UUID],
    ) -> dict[UUID, UserView]:
        users = await self.repository.get_users_by_ids(uow.session, user_ids)
        return {user.id: UserView(id=user.id, email=user.email_normalized) for user in users}

    async def _live_session(
        self,
        uow: UnitOfWork,
        raw_session_token: str,
    ) -> tuple[UserSession | None, User | None]:
        row = await self.repository.get_session_by_token_hash(
            uow.session,
            hash_token(raw_session_token),
        )
        if row is None or not self._session_is_live(row, datetime.now(UTC)):
            return None, None
        user = await self.repository.get_user_by_id(uow.session, row.user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            return None, None
        return row, user

    def _session_is_live(self, row: UserSession, now: datetime) -> bool:
        return row.revoked_at is None and row.expires_at > now
