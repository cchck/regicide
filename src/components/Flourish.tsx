export default function Flourish({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 40 20" className="w-8 h-4 sm:w-10 sm:h-5" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M0,10 L18,10 M18,10 L24,4 M18,10 L24,16 M24,4 L34,4 M24,16 L34,16" fill="none" stroke="#8a6a20" strokeWidth="0.8" opacity="0.8" />
      <circle cx="36" cy="4" r="1.2" fill="#c49a30" opacity="0.8" />
      <circle cx="36" cy="16" r="1.2" fill="#c49a30" opacity="0.8" />
    </svg>
  );
}
