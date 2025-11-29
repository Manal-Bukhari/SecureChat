import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signIn } from '../store/slices/userSlice';
import { Button } from '../components/ui/Button';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const dispatch = useDispatch();
  const { loading, error, userDetails } = useSelector((state) => state.user);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const isAuthenticated = token || userDetails;
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [userDetails, navigate]);

  useEffect(() => {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setFormData((prev) => ({
        ...prev,
        email: rememberedEmail,
        rememberMe: true,
      }));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await dispatch(signIn({
      email: formData.email,
      password: formData.password,
    }));

    if (response.meta.requestStatus === "fulfilled") {
      toast.success(`Welcome, ${response.payload.user.fullName || 'User'}!`);
      
      if (formData.rememberMe) {
        localStorage.setItem("rememberedEmail", formData.email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      navigate("/chat");
    } else {
      toast.error(response.payload || "Login failed.");
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-background px-4 py-16 w-full" style={{ margin: 0, paddingTop: '4rem' }}>
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-elevated border border-border">
        <h2 className="text-3xl font-bold mb-6 text-center text-foreground">
          Sign In
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <input
              type="email"
              name="email"
              placeholder="FAST Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full pl-10 pr-4 py-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full pl-10 pr-12 py-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex justify-between items-center text-sm">
            <label className="flex items-center text-foreground">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="mr-2"
              />
              Remember me
            </label>
          </div>

          <Button
            type="submit"
            disabled={loading}
            isLoading={loading}
            variant="primary"
            className="w-full"
            size="lg"
          >
            Sign In
          </Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-primary hover:underline font-semibold"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

