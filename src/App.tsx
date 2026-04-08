/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TemplateManager from './components/TemplateManager';
import Login from './components/Login';
import Settings from './components/Settings';
import LicenseManager from './components/LicenseManager';
import MobileDashboard from './components/mobile/MobileDashboard';
import { useMobile } from './hooks/useMobile';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-screen bg-binance-bg text-binance-text overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-binance-bg">
        {children}
      </div>
    </div>
  );
};

const DashboardWrapper = () => {
  const isMobile = useMobile();
  if (isMobile) {
    return <MobileDashboard />;
  }
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardWrapper />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <PrivateRoute>
              <Layout>
                <TemplateManager />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <Layout>
                <Settings />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/licenses"
          element={
            <PrivateRoute>
              <Layout>
                <LicenseManager />
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}
