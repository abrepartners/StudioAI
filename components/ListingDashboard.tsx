/**
 * ListingDashboard.tsx — Central Listing Dashboard
 * Task 1.7 — Aggregates all assets per listing
 *
 * Shows: all listings, per-listing asset status, quick actions
 * Add to sidebar nav as "Listings" route
 */

import React, { useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Image as ImageIcon,
  FileText,
  Globe,
  Printer,
  Instagram,
  Download,
  ChevronRight,
  Check,
  Clock,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  DollarSign,
  Trash2,
} from 'lucide-react';
import { useListing, type Listing } from '../hooks/useListing';

// ─── Asset Status Badge ───────────────────────────────────────────────────────

const AssetBadge: React.FC<{ done: boolean; label: string; icon: React.ElementType }> = ({
  done,
  label,
  icon: Icon,
}) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
      done
        ? 'bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/20'
        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
    }`}
  >
    {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
    {label}
  </div>
);

// ─── Listing Card ─────────────────────────────────────────────────────────────

const ListingCard: React.FC<{
  listing: Listing;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ listing, onSelect, onDelete }) => {
  const heroPhoto = listing.photos[0]?.stagedUrl || listing.photos[0]?.originalUrl;
  const { assets } = listing;
  const assetCount = [
    assets.mlsExported,
    assets.descriptionGenerated,
    assets.socialPackCreated,
    assets.printCollateralCreated,
    assets.propertyWebsitePublished,
  ].filter(Boolean).length;

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(listing.price);

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all duration-200 cursor-pointer group"
      onClick={() => onSelect(listing.id)}
    >
      {/* Hero Image */}
      <div className="relative h-40 bg-zinc-800">
        {heroPhoto ? (
          <img src={heroPhoto} alt={listing.address} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-zinc-600" />
          </div>
        )}
        {/* Photo count */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-white flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          {listing.photos.length} photos
        </div>
        {/* Asset progress */}
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-white">
          {assetCount}/5 assets
        </div>
        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(listing.id); }}
          className="absolute bottom-2 right-2 w-7 h-7 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#FF375F]/80 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <div>
          <div className="text-[#0A84FF] font-semibold text-lg">{formattedPrice}</div>
          <div className="text-white text-sm font-medium mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-zinc-500" />
            {listing.address || 'No address set'}
          </div>
        </div>

        {/* Specs */}
        <div className="flex gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1"><Bed className="w-3 h-3" /> {listing.beds} bd</span>
          <span className="flex items-center gap-1"><Bath className="w-3 h-3" /> {listing.baths} ba</span>
          <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3" /> {listing.sqft.toLocaleString()} sqft</span>
        </div>

        {/* Asset Badges */}
        <div className="flex flex-wrap gap-1.5">
          <AssetBadge done={assets.mlsExported} label="MLS" icon={Download} />
          <AssetBadge done={assets.descriptionGenerated} label="Description" icon={FileText} />
          <AssetBadge done={assets.socialPackCreated} label="Social" icon={Instagram} />
          <AssetBadge done={assets.printCollateralCreated} label="Print" icon={Printer} />
          <AssetBadge done={assets.propertyWebsitePublished} label="Website" icon={Globe} />
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Clock className="w-3 h-3" />
          Updated {new Date(listing.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

// ─── Stats Bar ────────────────────────────────────────────────────────────────

const StatsBar: React.FC<{ listings: Listing[] }> = ({ listings }) => {
  const totalPhotos = listings.reduce((sum, l) => sum + l.photos.length, 0);
  const completedAssets = listings.reduce((sum, l) => {
    const a = l.assets;
    return sum + [a.mlsExported, a.descriptionGenerated, a.socialPackCreated, a.printCollateralCreated, a.propertyWebsitePublished].filter(Boolean).length;
  }, 0);
  const totalPossible = listings.length * 5;

  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { value: listings.length, label: 'Listings', color: '#0A84FF' },
        { value: totalPhotos, label: 'Staged Photos', color: '#30D158' },
        { value: completedAssets, label: 'Assets Created', color: '#FFD60A' },
        { value: totalPossible > 0 ? Math.round((completedAssets / totalPossible) * 100) + '%' : '0%', label: 'Completion', color: '#FF375F' },
      ].map(({ value, label, color }) => (
        <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          <div className="text-[11px] text-zinc-500 mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const ListingDashboard: React.FC = () => {
  const { listings, createListing, deleteListing, setCurrentListing } = useListing();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newBeds, setNewBeds] = useState(3);
  const [newBaths, setNewBaths] = useState(2);
  const [newSqft, setNewSqft] = useState(2000);
  const [newPrice, setNewPrice] = useState(450000);

  const handleCreate = () => {
    if (!newAddress.trim()) return;
    createListing({
      address: newAddress,
      beds: newBeds,
      baths: newBaths,
      sqft: newSqft,
      price: newPrice,
      propertyType: 'Single Family',
    });
    setNewAddress('');
    setShowNewForm(false);
  };

  const handleSelect = (id: string) => {
    setCurrentListing(id);
    // Navigate to listing detail view — integrate with your router or panel state
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <LayoutGrid className="w-6 h-6 text-[#0A84FF]" />
            Listings
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            {listings.length} {listings.length === 1 ? 'listing' : 'listings'} — track assets and progress for each property
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0A84FF] text-white rounded-xl text-sm font-medium hover:bg-blue-500 active:scale-[0.98] transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          New Listing
        </button>
      </div>

      {/* Stats */}
      <StatsBar listings={listings} />

      {/* New Listing Form */}
      {showNewForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-medium text-sm">Add New Listing</h3>
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Property address"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Beds', value: newBeds, set: setNewBeds },
              { label: 'Baths', value: newBaths, set: setNewBaths },
              { label: 'Sq Ft', value: newSqft, set: setNewSqft },
              { label: 'Price', value: newPrice, set: setNewPrice },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="text-[10px] text-zinc-500 uppercase">{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex-1 py-2.5 bg-[#0A84FF] text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-all">
              Create Listing
            </button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2.5 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:text-white transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Listings Grid */}
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onSelect={handleSelect}
              onDelete={deleteListing}
            />
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <LayoutGrid className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-white font-medium">No listings yet</h3>
          <p className="text-zinc-500 text-sm mt-1 mb-4">
            Create your first listing to start tracking staged photos and marketing assets.
          </p>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2 bg-[#0A84FF] text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-all"
          >
            Add Your First Listing
          </button>
        </div>
      )}
    </div>
  );
};

export default ListingDashboard;
