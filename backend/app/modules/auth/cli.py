import argparse
import asyncio
import sys

from app.core.config import get_settings
from app.core.errors import ApplicationError
from app.infrastructure.db.session import UnitOfWork, create_db_engine, create_session_factory
from app.modules.auth.service import AuthService


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a Fluxora user or grant platform admin")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password")
    parser.add_argument("--platform-admin", action="store_true")
    parser.add_argument("--grant-platform-admin", action="store_true")
    args = parser.parse_args(argv)
    if args.grant_platform_admin and (args.password is not None or args.platform_admin):
        parser.error("--grant-platform-admin only accepts --email")
    if not args.grant_platform_admin and not args.password:
        parser.error("--password is required to create a user")
    try:
        if args.grant_platform_admin:
            user_id = asyncio.run(_grant_platform_admin(args.email))
        else:
            password = args.password
            if password is None:
                parser.error("--password is required to create a user")
            user_id = asyncio.run(
                _create_user(args.email, password, platform_admin=args.platform_admin)
            )
    except ApplicationError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    print(user_id)
    return 0


async def _create_user(email: str, password: str, *, platform_admin: bool) -> str:
    settings = get_settings()
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            user = await AuthService(settings).create_user(
                UnitOfWork(session),
                email,
                password,
                platform_admin=platform_admin,
            )
    finally:
        await engine.dispose()
    return str(user.id)


async def _grant_platform_admin(email: str) -> str:
    settings = get_settings()
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            user = await AuthService(settings).grant_platform_admin(UnitOfWork(session), email)
    finally:
        await engine.dispose()
    return str(user.id)


if __name__ == "__main__":
    raise SystemExit(main())
