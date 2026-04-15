import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <span className="text-4xl font-mono text-foreground">404</span>
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        go home
      </Link>
    </div>
  );
}