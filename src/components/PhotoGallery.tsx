// File: src/components/PhotoGallery.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { Camera } from "lucide-react";
import type { TransactionWithDetails, PhotoInfo } from "../types/transaction";

interface PhotoGalleryProps {
  transactions: TransactionWithDetails[];
}

interface GalleryEntry {
  photo: PhotoInfo;
  transaction: TransactionWithDetails;
  imageUrl: string;
}

export default function PhotoGallery({ transactions }: PhotoGalleryProps) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<GalleryEntry | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    loadPhotos();
  }, [transactions]);

  const loadPhotos = async () => {
    setLoading(true);
    const withPhotos = transactions.filter((t) => t.photo_count > 0);

    const allEntries: GalleryEntry[] = [];
    for (const txn of withPhotos) {
      try {
        const photos = await invoke<PhotoInfo[]>("get_transaction_photos", {
          transactionId: txn.id,
        });
        for (const photo of photos) {
          allEntries.push({
            photo,
            transaction: txn,
            imageUrl: convertFileSrc(photo.full_path),
          });
        }
      } catch {
        // skip unresolvable
      }
    }

    setEntries(allEntries);
    setLoading(false);
  };

  const handleOpenPreview = (entry: GalleryEntry) => {
    setSelectedEntry(entry);
    setZoom(1);
  };

  const handleClosePreview = () => {
    setSelectedEntry(null);
    setZoom(1);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Loading receipts...
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Camera className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
          No receipts found
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Attach photos to transactions via the edit modal to see them here
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {entries.map((entry) => (
          <div
            key={entry.photo.id}
            onClick={() => handleOpenPreview(entry)}
            className="group cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all"
          >
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <img
                src={entry.imageUrl}
                alt="Receipt"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    entry.transaction.transaction_type === "INCOME"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : entry.transaction.transaction_type === "EXPENSE"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
                  {entry.transaction.transaction_type}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(entry.transaction.date).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                LKR{" "}
                {entry.transaction.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {entry.transaction.category_name || entry.transaction.account_name}
              </p>
              {entry.transaction.memo && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {entry.transaction.memo}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Fullscreen Preview ─── */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex flex-col"
          onClick={handleClosePreview}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white">
              <p className="font-semibold">
                LKR{" "}
                {selectedEntry.transaction.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}{" "}
                — {selectedEntry.transaction.category_name || selectedEntry.transaction.account_name}
              </p>
              <p className="text-sm text-gray-400">
                {new Date(selectedEntry.transaction.date).toLocaleDateString()} •{" "}
                {selectedEntry.transaction.memo || "No memo"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Zoom out"
              >
                <MagnifyingGlassMinusIcon className="h-5 w-5" />
              </button>
              <span className="text-sm text-gray-300 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Zoom in"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>
              <button
                onClick={handleClosePreview}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors ml-4"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Image */}
          <div
            className="flex-1 flex items-center justify-center overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedEntry.imageUrl}
              alt="Receipt"
              style={{ transform: `scale(${zoom})` }}
              className="max-w-full max-h-full object-contain transition-transform duration-200 cursor-grab"
              draggable={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
