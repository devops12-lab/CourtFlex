import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="max-w-lg py-10">
      <h1 className="text-3xl font-expanded">Page not found</h1>
      <p className="mt-2 text-line-dim">This admin page doesn't exist, or it has moved.</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-ball underline underline-offset-4">
        Back to the dashboard
      </Link>
    </div>
  );
}
