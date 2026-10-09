import argparse
import hashlib
import secrets
import sqlite3
import sys

from bookrats import db, store
from bookrats.config import Settings


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="bookrats")
    sub = p.add_subparsers(dest="command", required=True)
    u = sub.add_parser("add-user", help="create a user and print its API token")
    u.add_argument("--name", required=True)
    u.add_argument("--kosync-user")
    u.add_argument("--kosync-password")
    u.add_argument("--goodreads-id")
    g = sub.add_parser("set-goodreads", help="link an existing user to a Goodreads profile")
    g.add_argument("--name", required=True)
    g.add_argument("--goodreads-id", required=True)
    r = sub.add_parser("new-reading", help="start a new active shared reading")
    r.add_argument("--title", required=True)
    r.add_argument("--author")
    r.add_argument("--goodreads-book-id")
    r.add_argument("--cover-url")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    conn = db.connect(Settings.from_env().db)
    if args.command == "add-user":
        if bool(args.kosync_user) != bool(args.kosync_password):
            print("error: --kosync-user and --kosync-password go together", file=sys.stderr)
            return 1
        key = hashlib.md5(args.kosync_password.encode()).hexdigest() if args.kosync_password else None
        token = secrets.token_urlsafe(24)
        try:
            store.add_user(
                conn,
                args.name,
                token,
                kosync_username=args.kosync_user,
                kosync_key=key,
                goodreads_user_id=args.goodreads_id,
            )
        except sqlite3.IntegrityError:
            print(f"error: user '{args.name}' already exists", file=sys.stderr)
            return 1
        print(f"user '{args.name}' created")
        print(f"api_token: {token}")
        return 0
    if args.command == "set-goodreads":
        try:
            store.set_goodreads_id(conn, args.name, args.goodreads_id)
        except KeyError:
            print(f"error: no user named '{args.name}'", file=sys.stderr)
            return 1
        print(f"user '{args.name}' linked to Goodreads {args.goodreads_id}")
        return 0
    rid = store.create_reading(conn, args.title, args.author, args.goodreads_book_id, args.cover_url)
    print(f"reading {rid} created: {args.title}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
