import ImageOptimizer from "@/components/ImageOptimizer";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            이미지 최적화 도구
          </h1>
          <p className="mt-2 text-lg text-gray-500 font-sans">
            Next.js 기반 고성능 서버리스 이미지 압축 도구
          </p>
        </div>
      </header>

      <div className="py-12">
        <ImageOptimizer />
      </div>

      <footer className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400 text-sm font-sans">
        &copy; {new Date().getFullYear()} Image Optimizer Tool. Built with Next.js & Sharp.
      </footer>
    </main>
  );
}
