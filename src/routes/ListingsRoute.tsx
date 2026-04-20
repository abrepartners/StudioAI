/**
 * ListingsRoute.tsx — R22
 *
 * Mounts ListingDashboard.tsx + useListing.ts (both already exist, both
 * unmounted prior to this phase) behind auth. Fork #5 locked: use these
 * as-is — do NOT refactor for the route mount.
 *
 * /listings        → grid of all listings (ListingDashboard's default view)
 * /listings/:id    → the dashboard honors `currentListing` internally;
 *                     we pre-seed it via useEffect.
 */

import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ListingDashboard from '../../components/ListingDashboard';
import { useListing } from '../../hooks/useListing';
import { readGoogleUser } from './authStorage';

const ListingsRoute: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { listings, setCurrentListing } = useListing();

  // Gate on auth — match editor behavior. Unauthed → landing.
  useEffect(() => {
    if (!readGoogleUser()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Sync URL param with the hook's currentListing.
  useEffect(() => {
    if (id) {
      const exists = listings.some((l) => l.id === id);
      if (exists) setCurrentListing(id);
      else if (listings.length > 0) {
        // Unknown id — bounce to grid rather than 404.
        navigate('/listings', { replace: true });
      }
    } else {
      setCurrentListing(null);
    }
  }, [id, listings, setCurrentListing, navigate]);

  useEffect(() => {
    document.title = id ? 'Listing · StudioAI' : 'Listings · StudioAI';
  }, [id]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-display text-lg tracking-tight">StudioAI</Link>
          <nav className="flex items-center gap-4 text-xs text-zinc-400">
            <Link to="/" className="hover:text-white transition">Studio</Link>
            <Link to="/listings" className="text-white font-semibold">Listings</Link>
            <Link to="/settings/brand" className="hover:text-white transition">Settings</Link>
          </nav>
        </div>
      </header>
      <ListingDashboard />
    </div>
  );
};

export default ListingsRoute;
