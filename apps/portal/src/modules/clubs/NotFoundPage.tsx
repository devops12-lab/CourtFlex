import { Link } from "react-router";
import { Wordmark } from "@courtflex/ui";

export function NotFoundPage({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-5">
      <Wordmark />
      <h1 className="text-2xl font-expanded font-bold">Out of bounds</h1>
      <p className="text-line-dim">{message ?? "This page doesn't exist or you don't have access to it."}</p>
      <Link to="/" className="font-semibold text-ball underline underline-offset-4">
        Go to your venue
      </Link>
    </div>
  );
}
