// src/components/LoadingSpinner.tsx
const LoadingSpinner = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="h-16 w-16 animate-spin rounded-full border-4 border-gray-300"
        style={{ borderTopColor: "transparent" }}
      />
      <p className="animate-pulse text-lg font-semibold text-white mt-4 ml-2">スーツに変身中...</p>
    </div>
  );
};

export default LoadingSpinner;
