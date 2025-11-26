import React, { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { setUserDetails } from '../../store/slices/userSlice';
import Navbar from './Navbar';
import Footer from './Footer';

function Layout() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { userDetails } = useSelector((state) => state.user);

  // Restore user from sessionStorage on mount
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const userStr = sessionStorage.getItem("user");
    
    if (token && userStr && !userDetails) {
      try {
        const user = JSON.parse(userStr);
        dispatch(setUserDetails(user));
      } catch (error) {
        console.error("Error parsing user from sessionStorage:", error);
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
      }
    }
  }, [dispatch, userDetails]);

  // Protect /chat and /settings routes, allow home page without login
  const isProtectedRoute = location.pathname === '/chat' || location.pathname === '/settings';
  const isAuthenticated = sessionStorage.getItem("token") || userDetails;

  // Redirect to login only if accessing protected routes without authentication
  if (isProtectedRoute && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ margin: 0, padding: 0, width: '100%' }}>
      <Navbar />
      <main className="flex-grow pt-16 w-full" style={{ margin: 0, width: '100%' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default Layout;

