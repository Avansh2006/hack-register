"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel padded">
      <h1>We couldn’t load this page.</h1>
      <p>Check your connection and workspace configuration, then try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
