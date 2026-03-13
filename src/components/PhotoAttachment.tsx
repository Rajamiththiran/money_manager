// File: src/components/PhotoAttachment.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Camera, X, Loader2, Maximize2, Trash2, ImageOff, Plus } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import Button from "./Button";
import type { PhotoInfo } from "../types/transaction";

interface PhotoAttachmentProps {
  transactionId: number;
  photoCount: number;
  onPhotoChange?: () => void;
  compact?: boolean;
}

/**
 * Standalone photo picker for use in the create form (before a transaction exists).
 * Returns the selected file paths without uploading to backend.
 */
interface PhotoPickerProps {
  selectedPaths: string[];
  onSelect: (paths: string[]) => void;
}

export function PhotoPicker({ selectedPaths, onSelect }: PhotoPickerProps) {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelect = async () => {
    setIsSelecting(true);
    try {
      const filePath = await open({
        filters: [
          {
            name: "Images",
            extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"],
          },
        ],
        title: "Select Receipt Photo",
        multiple: true,
      });

      if (filePath) {
        const paths = Array.isArray(filePath) ? filePath : [filePath];
        onSelect([...selectedPaths, ...paths]);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleRemove = (index: number) => {
    const updated = selectedPaths.filter((_, i) => i !== index);
    onSelect(updated);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Receipt Photos
      </label>

      {selectedPaths.length > 0 && (
        <div className="space-y-2">
          {selectedPaths.map((path, index) => {
            const fileName = path.split(/[/\\]/).pop() || "Selected photo";
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
              >
                <Camera className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                  {fileName}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleSelect}
        disabled={isSelecting}
        className="w-full h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {isSelecting ? (
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        ) : (
          <>
            <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
              {selectedPaths.length > 0 ? (
                <Plus className="w-4 h-4 text-gray-400" />
              ) : (
                <Camera className="w-4 h-4 text-gray-400" />
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedPaths.length > 0
                ? "Click to add more photos"
                : "Click to attach receipt photos"}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              JPG, PNG, WebP • Auto-compressed
            </span>
          </>
        )}
      </button>
    </div>
  );
}

// ======================== Main PhotoAttachment ========================

export default function PhotoAttachment({
  transactionId,
  photoCount,
  onPhotoChange,
  compact = false,
}: PhotoAttachmentProps) {
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  // Load photos on mount or when photoCount changes
  useEffect(() => {
    if (photoCount > 0 || photos.length > 0) {
      loadPhotos();
    }
  }, [transactionId, photoCount]);

  const loadPhotos = async () => {
    setIsLoading(true);
    try {
      const result = await invoke<PhotoInfo[]>("get_transaction_photos", {
        transactionId,
      });
      setPhotos(result);
      setBrokenImages(new Set());
    } catch (err) {
      console.error("Failed to load photos:", err);
      setPhotos([]);
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
        multiple: true,
      });

      if (!filePath) {
        setIsUploading(false);
        return;
      }

      const paths = Array.isArray(filePath) ? filePath : [filePath];

      for (const path of paths) {
        await invoke<PhotoInfo>("attach_photo", {
          transactionId,
          sourcePath: path,
        });
      }

      await loadPhotos();
      onPhotoChange?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (photoId: number) => {
    setError(null);
    setRemovingId(photoId);
    try {
      await invoke("remove_photo", { photoId });
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (previewPhoto?.id === photoId) {
        setPreviewPhoto(null);
      }
      onPhotoChange?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setRemovingId(null);
    }
  };

  const markBroken = (photoId: number) => {
    setBrokenImages((prev) => new Set(prev).add(photoId));
  };

  // Compact mode: show small thumbnail(s)
  if (compact) {
    if (isLoading) {
      return (
        <div className="w-8 h-8 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      );
    }

    if (photos.length === 0) return null;

    return (
      <>
        <div className="flex items-center gap-1">
          {photos.slice(0, 3).map((photo) => {
            const imageUrl = convertFileSrc(photo.full_path);
            if (brokenImages.has(photo.id)) {
              return (
                <button
                  key={photo.id}
                  onClick={() => setPreviewPhoto(photo)}
                  className="w-8 h-8 rounded-md flex items-center justify-center border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                  title="Receipt (image unavailable)"
                >
                  <ImageOff className="w-4 h-4 text-gray-400" />
                </button>
              );
            }
            return (
              <button
                key={photo.id}
                onClick={() => setPreviewPhoto(photo)}
                className="w-8 h-8 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400 transition-all flex-shrink-0"
                title="View receipt"
              >
                <img
                  src={imageUrl}
                  alt="Receipt"
                  className="w-full h-full object-cover"
                  onError={() => markBroken(photo.id)}
                />
              </button>
            );
          })}
          {photos.length > 3 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
              +{photos.length - 3}
            </span>
          )}
        </div>

        {/* Preview Modal */}
        {previewPhoto && (
          <PhotoPreviewModal
            imageUrl={convertFileSrc(previewPhoto.full_path)}
            onClose={() => setPreviewPhoto(null)}
            onRemove={() => handleRemove(previewPhoto.id)}
            isRemoving={removingId === previewPhoto.id}
          />
        )}
      </>
    );
  }

  // Full mode: upload area + thumbnails grid
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Receipt Photos
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {isLoading ? (
        <div className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Photo thumbnails grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => {
                const imageUrl = convertFileSrc(photo.full_path);
                const isBroken = brokenImages.has(photo.id);

                return (
                  <div key={photo.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(photo)}
                      className="w-full aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400 transition-all"
                    >
                      {isBroken ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                          <ImageOff className="w-8 h-8 text-gray-400" />
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

                    {/* Overlay actions */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(photo)}
                        className="p-1.5 bg-white/90 dark:bg-gray-800/90 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
                        title="View full size"
                      >
                        <Maximize2 className="w-3 h-3 text-gray-700 dark:text-gray-300" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(photo.id)}
                        disabled={removingId === photo.id}
                        className="p-1.5 bg-red-500/90 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                        title="Remove photo"
                      >
                        {removingId === photo.id ? (
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upload button */}
          <button
            type="button"
            onClick={handleAttach}
            disabled={isUploading}
            className="w-full h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Compressing...
                </span>
              </>
            ) : (
              <>
                <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                  {photos.length > 0 ? (
                    <Plus className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Camera className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {photos.length > 0
                    ? "Add more receipt photos"
                    : "Click to attach receipt photos"}
                </span>
              </>
            )}
          </button>
        </>
      )}

      {/* Preview Modal */}
      {previewPhoto && (
        <PhotoPreviewModal
          imageUrl={convertFileSrc(previewPhoto.full_path)}
          onClose={() => setPreviewPhoto(null)}
          onRemove={() => handleRemove(previewPhoto.id)}
          isRemoving={removingId === previewPhoto.id}
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
  const [imgError, setImgError] = useState(false);

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
        {imgError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 bg-gray-900 rounded-lg">
            <ImageOff className="w-16 h-16 text-gray-500" />
            <p className="text-gray-400">Image could not be loaded</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt="Receipt"
            className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            onError={() => setImgError(true)}
          />
        )}

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
