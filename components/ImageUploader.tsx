import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Camera, Loader2 } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (base64: string) => void;
  isAnalyzing?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isAnalyzing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // R29: track whether a file is hovering over the drop zone so we can flash
  // the border + show a "Drop to upload" overlay.
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // onDragLeave fires on every child transition; we use a counter so the
  // overlay doesn't flicker as the cursor crosses internal elements.
  const dragCounter = useRef(0);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    // Allow selecting the same file again after upload.
    event.target.value = '';
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onImageUpload(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (isAnalyzing) return;
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) processFile(file);
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (isAnalyzing) return;
    // Only react to file drags, not random DOM drags (e.g. text selection).
    const hasFiles = Array.from(event.dataTransfer.types || []).includes('Files');
    if (!hasFiles) return;
    dragCounter.current += 1;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingOver(false);
  };

  const triggerFileUpload = () => {
    if (isAnalyzing) return;
    fileInputRef.current?.click();
  };

  const triggerCameraUpload = () => {
    if (isAnalyzing) return;
    cameraInputRef.current?.click();
  };

  return (
    <div
      className={`premium-surface rounded-2xl p-6 text-center transition-all duration-200 relative ${
        isAnalyzing
          ? 'opacity-75 cursor-not-allowed'
          : isDraggingOver
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-xl'
            : 'hover:-translate-y-0.5 hover:shadow-md'
      }`}
      style={isDraggingOver ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* R29: drag-over overlay */}
      {isDraggingOver && !isAnalyzing ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,132,255,0.12), rgba(10,132,255,0.05))',
            border: '2px dashed var(--color-primary)',
          }}
          aria-hidden
        >
          <Upload size={28} className="text-[var(--color-primary)] animate-pulse" />
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Drop to upload
          </p>
        </div>
      ) : null}

      {isAnalyzing ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-2">
          <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Analyzing Space</h3>
            <p className="mt-1 text-xs text-[var(--color-text)]">Extracting room type and palette...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-bg-deep)] text-[var(--color-primary)]">
            <ImageIcon size={20} />
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Drop a room photo</h3>
          <p className="mx-auto mt-1 text-sm text-[var(--color-text)]">
            or choose an option below
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={triggerFileUpload}
              className="cta-primary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Upload size={14} /> Upload
            </button>
            <button
              type="button"
              onClick={triggerCameraUpload}
              className="cta-secondary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Camera size={14} /> Camera
            </button>
          </div>
        </>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        capture="environment"
      />
    </div>
  );
};

export default ImageUploader;
