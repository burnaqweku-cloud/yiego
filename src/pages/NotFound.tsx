import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div>
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground">This page doesn’t exist yet.</p>
      </div>
      <Link to="/">
        <Button className="gap-2">
          <Home className="w-4 h-4" />
          Go home
        </Button>
      </Link>
    </main>
  );
};

export default NotFound;
