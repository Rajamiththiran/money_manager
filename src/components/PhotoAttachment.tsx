// File: src/components/PhotoAttachment.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Camera, X, Image, Loader2, Maximize2, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import Button from "./Button";

interface PhotoAttachmentProps {
  transactionId: number;
  photoPath: string | null;
  onPhotoChange?: () => void;
  compact?: boolean;
}

export default function PhotoAttachment({
  transactionId,
  photoPath,
  onPhotoChange,
  compact = false,
}: PhotoAttachmentProps) {
  const [fullPath, setFullPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load photo path on mount or when photoPath changes
  useEffect(() => {
    if (photoPath) {
      loadPhotoPath();
    } else {
      setFullPath(null);
    }
  }, [photoPath, transactionId]);

  const loadPhotoPath = async () => {
    setIsLoading(true);
    try {
      const path = await invoke<string | null>("get_photo_path", {
        transactionId,
      });
      setFullPath(path);
    } catch (err) {
      console.error("Failed to load photo:", err);
      setFullPath(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttach = async () => {
    setError(null);
    setIsUploading(true);
    try {
      const filePath = await open({
        filters: [
          {
            name: "Images",
            extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"],
          },
        ],
        title: "Select Receipt Photo",
        multiple: false,
      });

      if (!filePath) {
        setIsUploading(false);
        return;
      }

      const resultPath = await invoke<string>("attach_photo", {
        transactionId,
        sourcePath: filePath as string,
      });

      setFullPath(resultPath);
      onPhotoChange?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setIsRemoving(true);
    try {
      await invoke("remove_photo", { transactionId });
      setFullPath(null);
      setShowPreview(false);
      onPhotoChange?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRemoving(false);
    }
  };

  // Convert file path to asset URL for display
  const imageUrl = fullPath ? convertFileSrc(fullPath) : null;

  // Compact mode: just a small icon/thumbnail
  if (compact) {
    if (isLoading) {
      return (
        <div className="w-8 h-8 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      );
    }

    if (fullPath && imageUrl) {
      return (
        <>
          <button
            onClick={() => setShowPreview(true)}
            className="w-8 h-8 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400 transition-all flex-shrink-0"
            title="View receipt"
          >
            <img
              src={imageUrl}
              alt="Receipt"
              className="w-full h-full object-cover"
            />
          </button>

          {/* Preview Modal */}
          {showPreview && (
            <PhotoPreviewModal
              imageUrl={imageUrl}
              onClose={() => setShowPreview(false)}
              onRemove={handleRemove}
              isRemoving={isRemoving}
            />
          )}
        </>
      );
    }

    return null; // No photo, no compact indicator
  }

  // Full mode: upload area + preview
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Receipt Photo
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {isLoading ? (
        <div className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : fullPath && imageUrl ? (
        /* Photo exists — show thumbnail */
        <div className="relative group">
          <button
            onClick={() => setShowPreview(true)}
            className="w-full h-40 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400 transition-all"
          >
            <img
              src={imageUrl}
              alt="Receipt"
              className="w-full h-full object-cover"
            />
          </button>

          {/* Overlay actions */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => setShowPreview(true)}
              className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="View full size"
            >
              <Maximize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            </button>
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="p-2 bg-red-500/90 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              title="Remove photo"
            >
              {isRemoving ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      ) : (
        /* No photo — show upload area */
        <button
          onClick={handleAttach}
          disabled={isUploading}
          className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center gap-2 disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Compressing...
              </span>
            </>
          ) : (
            <>
              <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700">
                <Camera className="w-5 h-5 text-gray-400" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Click to attach a receipt photo
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                JPG, PNG, WebP • Auto-compressed
              </span>
            </>
          )}
        </button>
      )}

      {/* Preview Modal */}
      {showPreview && imageUrl && (
        <PhotoPreviewModal
          imageUrl={imageUrl}
          onClose={() => setShowPreview(false)}
          onRemove={handleRemove}
          isRemoving={isRemoving}
        />
      )}
    </div>
  );
}

// ======================== Preview Modal ========================

function PhotoPreviewModal({
  imageUrl,
  onClose,
  onRemove,
  isRemoving,
}: {
  imageUrl: string;
  onClose: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Image */}
        <img
          src={imageUrl}
          alt="Receipt"
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
        />

        {/* Bottom actions */}
        <div className="flex justify-center mt-4">
          <Button
            variant="danger"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
            icon={
              isRemoving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )
            }
          >
            {isRemoving ? "Removing..." : "Remove Photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
