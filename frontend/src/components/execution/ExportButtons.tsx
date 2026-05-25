'use client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  executionId: string;
}

function downloadUrl(executionId: string, format: string) {
  return `${BASE_URL}/executions/${executionId}/report?format=${format}`;
}

export function ExportButtons({ executionId }: Props) {
  const handleDownload = async (format: string) => {
    const url = downloadUrl(executionId, format);
    const res = await fetch(url);
    if (!res.ok) {
      alert('Export not available yet — strategy may still be executing.');
      return;
    }

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const ext = format === 'csv' ? 'csv' : format === 'text' ? 'txt' : 'json';
    a.download = `meridian-${executionId.slice(0, 8)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mt-6">
      <p className="text-xs text-gray-500 mb-2">Export execution report</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void handleDownload('csv')}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors"
        >
          CSV (Koinly/CoinTracker)
        </button>
        <button
          onClick={() => void handleDownload('json')}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors"
        >
          JSON (raw data)
        </button>
        <button
          onClick={() => void handleDownload('text')}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors"
        >
          PDF Report (text)
        </button>
      </div>
    </div>
  );
}
