import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button } from '../components/ui/Button';

export default function HomePage() {
  const navigate = useNavigate();
  const { userDetails } = useSelector((state) => state.user);
  const isAuthenticated = sessionStorage.getItem("token") || userDetails;

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-secondary-900 dark:to-secondary-800 px-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-5xl font-bold text-secondary-900 dark:text-secondary-100 mb-4">
          SecureChat
        </h1>
        <p className="text-xl text-secondary-600 dark:text-secondary-400 mb-8">
          End-to-end encrypted messaging for secure conversations
        </p>
        
        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => navigate("/login")}
            variant="primary"
            size="lg"
          >
            Sign In
          </Button>
          <Button
            onClick={() => navigate("/register")}
            variant="outline"
            size="lg"
          >
            Sign Up
          </Button>
        </div>
      </div>
    </div>
  );
}

