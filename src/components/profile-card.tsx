"use client";

import type { Profile } from "@/types";
import { Trash2, Pencil } from "lucide-react";
import { useState } from "react";

interface ProfileCardProps {
  profile: Profile;
  onSelect: (profile: Profile) => void;
  onEdit?: (profile: Profile, newName: string, contentRating: Profile["contentRating"]) => void;
  onDelete?: (profile: Profile) => void;
  isAdd?: boolean;
  onAdd?: () => void;
}

export function ProfileCard({ profile, onSelect, onEdit, onDelete, isAdd, onAdd }: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editRating, setEditRating] = useState<Profile["contentRating"]>(profile.contentRating || (profile.isKids ? "13+" : "all"));

  if (isAdd) {
    return (
      <button
        onClick={onAdd}
        className="group flex flex-col items-center gap-3 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 text-4xl text-zinc-500 transition-colors group-hover:border-yellow-400 group-hover:text-yellow-400 md:h-32 md:w-32">
          +
        </div>
        <span className="text-sm text-zinc-400 group-hover:text-white">Add Profile</span>
      </button>
    );
  }

  const handleSaveEdit = () => {
    if (editName.trim() && onEdit) {
      onEdit(profile, editName.trim(), editRating);
      setEditing(false);
    }
  };

  return (
    <div className="group relative flex flex-col items-center gap-3">
      <button
        onClick={() => onSelect(profile)}
        className="flex flex-col items-center gap-3 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-zinc-800 text-5xl transition-transform group-hover:scale-105 md:h-32 md:w-32">
          {profile.avatar}
        </div>
        {editing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              className="w-28 rounded bg-zinc-800 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <select value={editRating} onChange={(event) => setEditRating(event.target.value as Profile["contentRating"])} onClick={(event) => event.stopPropagation()} className="w-28 rounded bg-zinc-800 px-2 py-1 text-center text-xs text-white"><option value="all">All</option><option value="18+">18+</option><option value="16+">16+</option><option value="13+">13+</option><option value="10+">10+</option></select>
          </>
        ) : (
          <span className="text-sm text-zinc-300 group-hover:text-white">{profile.name}</span>
        )}
      </button>

      {!profile.isKids && (
        <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            aria-label="Edit profile"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete?.(profile)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-900/50 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            aria-label="Delete profile"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
