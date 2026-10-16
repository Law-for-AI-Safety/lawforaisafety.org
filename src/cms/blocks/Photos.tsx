import Image from "next/image";

export type Photo = { image: string; alt: string };

const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
};

/** Up to three photos side by side; a single photo fills the width, wider on larger screens. */
export default function Photos({ photos }: { photos: Photo[] }) {
  const one = photos.length === 1;
  return (
    <div className={`grid ${GRID[photos.length]} gap-4`}>
      {photos.map((photo, i) => (
        <div key={i} className={`relative w-full ${one ? "aspect-[4/3] md:aspect-[16/9]" : "aspect-[4/3]"} rounded-sm overflow-hidden`}>
          <Image
            src={photo.image}
            alt={photo.alt}
            fill
            className="object-cover"
            sizes={one ? "(max-width: 768px) 100vw, 896px" : `(max-width: 768px) 100vw, ${Math.round(896 / photos.length)}px`}
          />
        </div>
      ))}
    </div>
  );
}
