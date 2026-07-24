import React from "react";
import { Icon } from "./icons";
import { readGoogleUser } from "../routes/authStorage";

interface SidebarProps {
  page: string;
  setPage: (p: string) => void;
  onNewListing: () => void;
  onUploadFiles?: () => void;
}

export const VellumSidebar: React.FC<SidebarProps> = ({
  page,
  setPage,
  onNewListing,
  onUploadFiles,
}) => {
  // Owner-only: the Property Morph tool (gated to book@averyandbryant.com).
  const isOwner = readGoogleUser()?.email === "book@averyandbryant.com";

  const NavItem = ({
    id,
    icon,
    label,
    badge,
  }: {
    id: string;
    icon: string;
    label: string;
    badge?: string;
  }) => (
    <button
      className={"v-nav-link" + (page === id ? " active" : "")}
      onClick={() => setPage(id)}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge && <span className="v-nav-badge">{badge}</span>}
    </button>
  );

  return (
    <aside className="v-sidebar">
      <div className="eyebrow">Workspace</div>
      <NavItem id="dashboard" icon="home" label="Dashboard" />
      <NavItem id="projects" icon="folder" label="Projects" />
      <NavItem id="photo" icon="image" label="Photo editor" />
      <NavItem id="video" icon="video" label="Video reels" />
      <NavItem id="batch" icon="layers" label="Batch pipeline" />
      <NavItem
        id="morph"
        icon="video"
        label="Property Morph"
        badge={isOwner ? undefined : "Soon"}
      />

      <div className="v-create-card">
        <span className="label">Create new</span>
        <button className="v-create-btn" onClick={onNewListing}>
          <Icon name="image" size={13} /> New listing
        </button>
        <button className="v-create-btn video" onClick={() => setPage("video")}>
          <Icon name="play" size={13} /> Listing reel
        </button>
        <button className="v-create-btn" onClick={() => onUploadFiles?.()}>
          <Icon name="upload" size={13} /> Upload files
        </button>
      </div>

      <div className="eyebrow">Account</div>
      <NavItem id="billing" icon="card" label="Plan & billing" />
      <NavItem id="settings" icon="settings" label="Settings" />
      <NavItem id="help" icon="help" label="Help" />
    </aside>
  );
};
