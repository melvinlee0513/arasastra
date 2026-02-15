import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import owlMascot from "@/assets/owl-mascot.png";
import { Link } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center bg-card border-border space-y-6">
        <div className="relative">
          <img
            src={owlMascot}
            alt="Confused Owl"
            className="w-24 h-24 mx-auto animate-bounce"
            style={{ animationDuration: "2s" }}
          />
          <div className="absolute -top-2 -right-2 text-4xl">❓</div>
        </div>

        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-primary">404</h1>
          <h2 className="text-xl font-semibold text-foreground">
            Whoops! This class doesn't exist.
          </h2>
          <p className="text-muted-foreground">
            Looks like you've wandered into uncharted territory. Even our owl mascot is confused!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button className="gap-2 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
