import argparse
import asyncio
import sys

from app.core.config import get_settings
from app.core.errors import ApplicationError
from app.infrastructure.db.session import UnitOfWork, create_db_engine, create_session_factory
from app.modules.auth.service import AuthService


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a Fluxora user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args(argv)
    try:
        user_id = asyncio.run(_create_user(args.email, args.password))
    except ApplicationError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    print(user_id)
    return 0


async def _create_user(email: str, password: str) -> str:
    settings = get_settings()
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            user = await AuthService(settings).create_user(UnitOfWork(session), email, password)
    finally:
        await engine.dispose()
    return str(user.id)


if __name__ == "__main__":
    raise SystemExit(main())
