import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UploadPage } from '@/pages/UploadPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { AdminPage } from '@/pages/AdminPage';
import { KnowledgeGraphPage } from '@/pages/KnowledgeGraphPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/review/:token" element={<ReviewPage />} />
        <Route path="/admin/:docId" element={<AdminPage />} />
        <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
        <Route path="/knowledge-graph/:docId" element={<KnowledgeGraphPage />} />
        <Route path="*" element={<UploadPage />} />
      </Routes>
    </Router>
  );
}
