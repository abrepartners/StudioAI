import React, { useRef } from 'react';
import { Upload, Image as ImageIcon, Camera, LoaderCircle } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (base64: string) => void;
  isAnalyzing?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isAnalyzing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
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
    if (isAnalyzing) return;
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const triggerFileUpload = () => {
    if (isAnalyzing) return;
    fileInputRef.current?.click();
  }

  return (
    <div
      className={`bg-slate-50 rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 ${isAnalyzing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-100'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {isAnalyzing ? (
        <div className="flex flex-col items-center justify-center">
          <LoaderCircle size={40} className="text-indigo-600 animate-spin mb-4" />
          <h3 className="text-lg font-semibold text-slate-800">Analyzing Image...</h3>
          <p className="text-slate-500 mt-1 text-sm">Extracting colors and room type.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border-4 border-slate-100 p-4 rounded-full mb-4 text-slate-500">
            <ImageIcon size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Upload a Photo</h3>
          <p className="text-slate-500 mt-1 text-sm max-w-xs">Drag & drop your image here, or use one of the options below.</p>
          <div className="flex items-center gap-4 mt-6">
            <button 
              onClick={triggerFileUpload}
              className="flex-1 bg-slate-900 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all"
            >
              <Upload size={16} />
              Upload
            </button>
            <button 
              onClick={triggerFileUpload} 
              className="flex-1 bg-white text-slate-800 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all border border-slate-200"
            >
              <Camera size={16} />
              Use Camera
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
        capture="environment"
      />
    </div>
  );
};

export default ImageUploader;
