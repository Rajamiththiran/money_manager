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
import type { TransactionWithDetails } from "../types/transaction";

interface PhotoGalleryProps {
  transactions: TransactionWithDetails[];
}

interface PhotoEntry {
  transactionId: number;
  photoPath: string;
  date: string;
  amount: number;
  transactionType: string;
  categoryName: string | null;
  accountName: string;
  memo: string | null;
}

export default function PhotoGallery({ transactions }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [resolvedPaths, setResolvedPaths] = useState<Record<number, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    loadPhotos();
  }, [transactions]);

  const loadPhotos = async () => {
    setLoading(true);
    const withPhotos = transactions.filter((t) => t.photo_path);

    const entries: PhotoEntry[] = withPhotos.map((t) => ({
      transactionId: t.id,
      photoPath: t.photo_path!,
      date: t.date,
      amount: t.amount,
      transactionType: t.transaction_type,
      categoryName: t.category_name,
      accountName: t.account_name,
      memo: t.memo,
    }));

    setPhotos(entries);

    // Resolve full paths
    const paths: Record<number, string> = {};
    for (const entry of entries) {
      try {
        const fullPath = await invoke<string>("get_photo_path", {
          transactionId: entry.transactionId,
        });
        paths[entry.transactionId] = convertFileSrc(fullPath);
      } catch {
        // skip unresolvable
      }
    }
    setResolvedPaths(paths);
    setLoading(false);
  };

  const handleOpenPreview = (photo: PhotoEntry) => {
    setSelectedPhoto(photo);
    setZoom(1);
  };

  const handleClosePreview = () => {
    setSelectedPhoto(null);
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

  if (photos.length === 0) {
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
        {photos.map((photo) => {
          const src = resolvedPaths[photo.transactionId];
          return (
            <div
              key={photo.transactionId}
              onClick={() => handleOpenPreview(photo)}
              className="group cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all"
            >
              <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                {src ? (
                  <img
                    src={src}
                    alt="Receipt"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      photo.transactionType === "INCOME"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : photo.transactionType === "EXPENSE"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    }`}
                  >
                    {photo.transactionType}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(photo.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  LKR{" "}
                  {photo.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {photo.categoryName || photo.accountName}
                </p>
                {photo.memo && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {photo.memo}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Fullscreen Preview ─── */}
      {selectedPhoto && (
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
                {selectedPhoto.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}{" "}
                — {selectedPhoto.categoryName || selectedPhoto.accountName}
              </p>
              <p className="text-sm text-gray-400">
                {new Date(selectedPhoto.date).toLocaleDateString()} •{" "}
                {selectedPhoto.memo || "No memo"}
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
            {resolvedPaths[selectedPhoto.transactionId] ? (
              <img
                src={resolvedPaths[selectedPhoto.transactionId]}
                alt="Receipt"
                style={{ transform: `scale(${zoom})` }}
                className="max-w-full max-h-full object-contain transition-transform duration-200 cursor-grab"
                draggable={false}
              />
            ) : (
              <p className="text-gray-400">Image not available</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
