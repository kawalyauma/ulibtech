'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1rem' }}
      >
        <h1>Something went wrong</h1>
        <p>Please check your connection and try again.</p>
        <button onClick={reset} style={{ padding: '0.6rem 1.2rem', marginTop: '1rem' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
