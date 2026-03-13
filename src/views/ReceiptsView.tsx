// File: src/views/ReceiptsView.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Squares2X2Icon,
  ListBulletIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import type { TransactionWithDetails, PhotoInfo } from "../types/transaction";

interface GalleryEntry {
  photo: PhotoInfo;
  transaction: TransactionWithDetails;
  imageUrl: string;
}

export default function ReceiptsView() {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewEntry, setPreviewEntry] = useState<GalleryEntry | null>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const loadAllReceipts = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all transactions (no date filter)
      const txns = await invoke<TransactionWithDetails[]>(
        "get_transactions_with_details",
      );

      // Only those with photos
      const withPhotos = txns.filter((t) => t.photo_count > 0);

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
          // skip
        }
      }

      setEntries(allEntries);
      setBrokenImages(new Set());
    } catch (err) {
      console.error("Failed to load receipts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllReceipts();
  }, [loadAllReceipts]);

  // Close preview on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && previewEntry) {
        setPreviewEntry(null);
        setZoom(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewEntry]);

  const handleDownload = async (photo: PhotoInfo) => {
    setDownloading(photo.id);
    try {
      const ext = photo.filename.split(".").pop() || "jpg";
      const destPath = await save({
        filters: [{ name: "Image", extensions: [ext] }],
        defaultPath: photo.filename,
        title: "Save Receipt Photo",
      });
      if (destPath) {
        await invoke("save_photo_to", { photoId: photo.id, destPath });
      }
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  const markBroken = (id: number) =>
    setBrokenImages((prev) => new Set(prev).add(id));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Receipts
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            All receipt photos across your transactions
            {entries.length > 0 && (
              <span className="ml-2 text-sm font-medium text-gray-500">
                ({entries.length} photo{entries.length !== 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>
        {/* View toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
            title="Grid view"
          >
            <Squares2X2Icon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
            title="List view"
          >
            <ListBulletIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading receipts...
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Camera className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
            No receipts yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Attach photos to your transactions to see them here
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ═══ Grid View ═══ */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {entries.map((entry) => (
            <div
              key={entry.photo.id}
              className="group cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all"
            >
              <button
                type="button"
                onClick={() => {
                  setPreviewEntry(entry);
                  setZoom(1);
                }}
                className="w-full aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden"
              >
                {brokenImages.has(entry.photo.id) ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="w-10 h-10 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={entry.imageUrl}
                    alt="Receipt"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={() => markBroken(entry.photo.id)}
                  />
                )}
              </button>
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
                  {entry.transaction.category_name ||
                    entry.transaction.account_name}
                </p>
                {/* Download button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(entry.photo);
                  }}
                  disabled={downloading === entry.photo.id}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {downloading === entry.photo.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ArrowDownTrayIcon className="h-3 w-3" />
                  )}
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ═══ List View ═══ */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {entries.map((entry) => (
            <div
              key={entry.photo.id}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              {/* Thumbnail */}
              <button
                type="button"
                onClick={() => {
                  setPreviewEntry(entry);
                  setZoom(1);
                }}
                className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600"
              >
                {brokenImages.has(entry.photo.id) ? (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <ImageOff className="w-6 h-6 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={entry.imageUrl}
                    alt="Receipt"
                    className="w-full h-full object-cover"
                    onError={() => markBroken(entry.photo.id)}
                  />
                )}
              </button>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
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
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  LKR{" "}
                  {entry.transaction.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  —{" "}
                  {entry.transaction.category_name ||
                    entry.transaction.account_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {entry.photo.filename}
                </p>
              </div>
              {/* Download */}
              <button
                onClick={() => handleDownload(entry.photo)}
                disabled={downloading === entry.photo.id}
                className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex-shrink-0"
                title="Download"
              >
                {downloading === entry.photo.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Full-Size Preview ═══ */}
      {previewEntry && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex flex-col"
          onClick={() => {
            setPreviewEntry(null);
            setZoom(1);
          }}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white min-w-0">
              <p className="font-semibold truncate">
                LKR{" "}
                {previewEntry.transaction.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}{" "}
                —{" "}
                {previewEntry.transaction.category_name ||
                  previewEntry.transaction.account_name}
              </p>
              <p className="text-sm text-gray-400 truncate">
                {new Date(
                  previewEntry.transaction.date,
                ).toLocaleDateString()}{" "}
                • {previewEntry.transaction.memo || "No memo"} •{" "}
                {previewEntry.photo.filename}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Zoom out"
              >
                <MagnifyingGlassMinusIcon className="h-5 w-5" />
              </button>
              <span className="text-sm text-gray-300 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Zoom in"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(previewEntry.photo);
                }}
                disabled={downloading === previewEntry.photo.id}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors ml-2"
                title="Download"
              >
                {downloading === previewEntry.photo.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <ArrowDownTrayIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => {
                  setPreviewEntry(null);
                  setZoom(1);
                }}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors ml-2"
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
            {brokenImages.has(previewEntry.photo.id) ? (
              <div className="flex flex-col items-center gap-3">
                <ImageOff className="w-16 h-16 text-gray-500" />
                <p className="text-gray-400">Image could not be loaded</p>
              </div>
            ) : (
              <img
                src={previewEntry.imageUrl}
                alt="Receipt"
                style={{ transform: `scale(${zoom})` }}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                draggable={false}
                onError={() => markBroken(previewEntry.photo.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
