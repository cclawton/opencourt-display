'use client';
/* oxlint-disable next/no-img-element -- uploaded signage images are previewed directly. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RemoteContent } from '@/lib/control-api';

export function ImageSlideshowEditor({
  images,
  imageIds,
  duration,
  busy,
  onChange,
  onDurationChange,
  onUpload,
}: {
  images: RemoteContent[];
  imageIds: string[];
  duration: number;
  busy: boolean;
  onChange: (ids: string[]) => void;
  onDurationChange: (seconds: number) => void;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const [preview, setPreview] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => {
    if (!showPreview || imageIds.length < 2 || duration < 3) return;
    const timer = window.setInterval(
      () => setPreview((index) => (index + 1) % imageIds.length),
      duration * 1000,
    );
    return () => window.clearInterval(timer);
  }, [showPreview, imageIds.length, duration]);
  function move(index: number, offset: number) {
    const next = [...imageIds];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  const previewIndex = imageIds.length ? preview % imageIds.length : 0;
  const current = images.find(
    (image) => image.contentId === imageIds[previewIndex],
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-court-ink/65">
        Add pictures, arrange their order, then choose how long each picture
        stays on screen. One picture will stay on screen continuously.
      </p>
      <div className="space-y-2">
        <Label htmlFor="slideshow-upload">Upload images</Label>
        <Input
          id="slideshow-upload"
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) void onUpload(files);
          }}
        />
        <p className="text-xs text-court-ink/50">
          JPEG or PNG, up to 20 MB each. Up to 50 pictures.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="slideshow-existing">Choose existing images</Label>
        <select
          id="slideshow-existing"
          className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
          value=""
          disabled={busy || imageIds.length >= 50}
          onChange={(event) => {
            if (event.target.value) onChange([...imageIds, event.target.value]);
          }}
        >
          <option value="">Choose a picture to add</option>
          {images
            .filter((image) => image.status === 'ready')
            .map((image) => (
              <option key={image.contentId} value={image.contentId}>
                {image.title}
              </option>
            ))}
        </select>
      </div>
      <ol className="space-y-2">
        {imageIds.map((id, index) => {
          const image = images.find((item) => item.contentId === id);
          return (
            <li
              key={`${index}-${id}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 p-2"
            >
              <span className="min-w-0 flex-1 text-sm">
                {index + 1}.{' '}
                {image?.title ?? 'Image unavailable — remove and add it again'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move picture ${index + 1} earlier`}
              >
                Move up
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || index === imageIds.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move picture ${index + 1} later`}
              >
                Move down
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  onChange(imageIds.filter((_, position) => position !== index))
                }
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="space-y-2">
        <Label htmlFor="slideshow-duration">
          Show each picture for (seconds)
        </Label>
        <Input
          id="slideshow-duration"
          type="number"
          min={3}
          max={300}
          step={1}
          value={duration}
          disabled={busy}
          onChange={(event) => onDurationChange(Number(event.target.value))}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={!imageIds.length}
        onClick={() => {
          setPreview(0);
          setShowPreview(!showPreview);
        }}
      >
        {showPreview ? 'Close preview' : 'Preview images'}
      </Button>
      {showPreview && imageIds.length > 0 && (
        <div className="space-y-2 rounded-xl bg-black p-3 text-white">
          {current?.source?.type === 'image' && (
            <img
              src={current.source.url}
              alt={current.title}
              className="aspect-video w-full object-contain"
            />
          )}
          <p className="text-sm">
            Picture {previewIndex + 1} of {imageIds.length} · {duration} seconds
          </p>
          <Button
            type="button"
            variant="outline"
            className="text-black"
            onClick={() => setPreview((preview + 1) % imageIds.length)}
          >
            Next picture
          </Button>
        </div>
      )}
    </div>
  );
}
