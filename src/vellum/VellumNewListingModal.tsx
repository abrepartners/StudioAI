import React, { useState } from 'react';
import { Icon } from './icons';

interface NewListingModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { address: string; city: string; propertyType: string; beds: number | null; baths: number | null }) => void;
}

const PROPERTY_TYPES = ['Single family', 'Condo', 'Townhome', 'Multi-family', 'Lot & land', 'Commercial'];

const VellumNewListingModal: React.FC<NewListingModalProps> = ({ open, onClose, onCreate }) => {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState('Single family');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');

  if (!open) return null;

  const canCreate = address.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({
      address: address.trim(),
      city: city.trim(),
      propertyType,
      beds: beds ? parseInt(beds) : null,
      baths: baths ? parseFloat(baths) : null,
    });
    setAddress('');
    setCity('');
    setPropertyType('Single family');
    setBeds('');
    setBaths('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canCreate) handleCreate();
  };

  return (
    <div className="v-modal-shade" onClick={onClose}>
      <div className="v-modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
        <button className="v-modal-close" onClick={onClose}><Icon name="close" size={14} /></button>
        <div className="v-modal-eyebrow">New listing</div>
        <div className="v-modal-title">Where's the <em>property?</em></div>
        <p className="v-muted" style={{ fontSize: 13, marginBottom: 24 }}>
          Enter the address to start a new project. You'll upload photos on the next screen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onKeyDown={handleKeyDown}>
          <div>
            <label className="v-field-label" style={{ marginBottom: 6, display: 'block' }}>Property address *</label>
            <input
              className="v-set-input"
              style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
              placeholder="1234 Main Street"
              value={address}
              onChange={e => setAddress(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="v-field-label" style={{ marginBottom: 6, display: 'block' }}>City, State</label>
            <input
              className="v-set-input"
              style={{ width: '100%', padding: '10px 12px' }}
              placeholder="Chicago, IL"
              value={city}
              onChange={e => setCity(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="v-field-label" style={{ marginBottom: 6, display: 'block' }}>Type</label>
              <select className="v-set-input" style={{ width: '100%' }} value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="v-field-label" style={{ marginBottom: 6, display: 'block' }}>Beds</label>
              <input className="v-set-input" style={{ width: '100%' }} type="number" min="0" placeholder="—" value={beds} onChange={e => setBeds(e.target.value)} />
            </div>
            <div>
              <label className="v-field-label" style={{ marginBottom: 6, display: 'block' }}>Baths</label>
              <input className="v-set-input" style={{ width: '100%' }} type="number" min="0" step="0.5" placeholder="—" value={baths} onChange={e => setBaths(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}>
          <button className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="v-btn v-btn--primary"
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ opacity: canCreate ? 1 : 0.5 }}
          >
            Create listing <Icon name="arrow_right" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VellumNewListingModal;
