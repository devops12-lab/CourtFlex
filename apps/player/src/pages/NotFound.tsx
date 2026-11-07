import { Link } from "react-router";

export function NotFound({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-16">
      <h1 className="text-2xl font-expanded font-bold">Out of bounds</h1>
      <p className="text-line-dim">{message ?? "This page doesn't exist, or you can't see it."}</p>
      <Link to="/sessions" className="font-semibold text-ball underline underline-offset-4">
        Find a session
      </Link>
    </div>
  );
}
