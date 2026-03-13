// File: src/components/ReceiptViewerModal.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import type { PhotoInfo, TransactionWithDetails } from "../types/transaction";

interface ReceiptViewerModalProps {
  transaction: TransactionWithDetails;
  onClose: () => void;
}

export default function ReceiptViewerModal({
  transaction,
  onClose,
}: ReceiptViewerModalProps) {
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadPhotos();
  }, [transaction.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewPhoto) {
          setPreviewPhoto(null);
          setZoom(1);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, previewPhoto]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const result = await invoke<PhotoInfo[]>("get_transaction_photos", {
        transactionId: transaction.id,
      });
      setPhotos(result);
    } catch (err) {
      console.error("Failed to load photos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (photo: PhotoInfo) => {
    setDownloading(photo.id);
    try {
      // Get the file extension from the filename
      const ext = photo.filename.split(".").pop() || "jpg";
      const destPath = await save({
        filters: [{ name: "Image", extensions: [ext] }],
        defaultPath: photo.filename,
        title: "Save Receipt Photo",
      });

      if (destPath) {
        await invoke("save_photo_to", {
          photoId: photo.id,
          destPath,
        });
      }
    } catch (err) {
      console.error("Failed to download photo:", err);
    } finally {
      setDownloading(null);
    }
  };

  const markBroken = (id: number) => {
    setBrokenImages((prev) => new Set(prev).add(id));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Receipts
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {transaction.transaction_type} •{" "}
              {transaction.category_name || transaction.account_name} •{" "}
              <span className="font-medium">
                LKR {transaction.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              {transaction.memo && ` • ${transaction.memo}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                title="Grid view"
              >
                <Squares2X2Icon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                title="List view"
              >
                <ListBulletIcon className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Camera className="w-12 h-12 mb-3" />
              <p className="text-sm">No receipts attached to this transaction</p>
            </div>
          ) : viewMode === "grid" ? (
            /* ═══ Grid View ═══ */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map((photo) => {
                const imageUrl = convertFileSrc(photo.full_path);
                const isBroken = brokenImages.has(photo.id);
                return (
                  <div
                    key={photo.id}
                    className="group relative bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600"
                  >
                    <button
                      type="button"
                      onClick={() => { setPreviewPhoto(photo); setZoom(1); }}
                      className="w-full aspect-square"
                    >
                      {isBroken ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="w-10 h-10 text-gray-400" />
                        </div>
                      ) : (
                        <img
                          src={imageUrl}
                          alt="Receipt"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={() => markBroken(photo.id)}
                        />
                      )}
                    </button>
                    {/* Download overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/80 truncate mr-2">
                          {photo.filename}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(photo);
                          }}
                          disabled={downloading === photo.id}
                          className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex-shrink-0"
                          title="Download"
                        >
                          {downloading === photo.id ? (
                            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                          ) : (
                            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-white" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ═══ List View ═══ */
            <div className="space-y-2">
              {photos.map((photo) => {
                const imageUrl = convertFileSrc(photo.full_path);
                const isBroken = brokenImages.has(photo.id);
                return (
                  <div
                    key={photo.id}
                    className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Thumbnail */}
                    <button
                      type="button"
                      onClick={() => { setPreviewPhoto(photo); setZoom(1); }}
                      className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600"
                    >
                      {isBroken ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                          <ImageOff className="w-6 h-6 text-gray-400" />
                        </div>
                      ) : (
                        <img
                          src={imageUrl}
                          alt="Receipt"
                          className="w-full h-full object-cover"
                          onError={() => markBroken(photo.id)}
                        />
                      )}
                    </button>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {photo.filename}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Click to view full size
                      </p>
                    </div>
                    {/* Download */}
                    <button
                      onClick={() => handleDownload(photo)}
                      disabled={downloading === photo.id}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex-shrink-0"
                      title="Download"
                    >
                      {downloading === photo.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <ArrowDownTrayIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {photos.length} receipt{photos.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs">
            {new Date(transaction.date).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* ═══════ Full-Size Preview Overlay ═══════ */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex flex-col"
          onClick={() => { setPreviewPhoto(null); setZoom(1); }}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-300 truncate mr-4">
              {previewPhoto.filename}
            </p>
            <div className="flex items-center gap-2">
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
                  handleDownload(previewPhoto);
                }}
                disabled={downloading === previewPhoto.id}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors ml-2"
                title="Download"
              >
                {downloading === previewPhoto.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <ArrowDownTrayIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => { setPreviewPhoto(null); setZoom(1); }}
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
            {brokenImages.has(previewPhoto.id) ? (
              <div className="flex flex-col items-center gap-3">
                <ImageOff className="w-16 h-16 text-gray-500" />
                <p className="text-gray-400">Image could not be loaded</p>
              </div>
            ) : (
              <img
                src={convertFileSrc(previewPhoto.full_path)}
                alt="Receipt"
                style={{ transform: `scale(${zoom})` }}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                draggable={false}
                onError={() => markBroken(previewPhoto.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
