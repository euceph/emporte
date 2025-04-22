import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from "react-router";
import '@/styles/globals.css';
import App from '@/App';
import ProtectedLayout from '@/components/protectedlayout';
import PublicLayout from '@/components/publiclayout';
import Home from '@/pages/home';
import About from '@/pages/about';
import PrivacyPolicy from '@/pages/privacy';
import Login from '@/pages/login';
import Import from '@/pages/import';
import Preview from '@/pages/preview';
import Success from '@/pages/success';
import NotFound from '@/pages/notfound';

createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
        <StrictMode>
            <Routes>
                <Route path="/" element={<App />}>

                    <Route element={<PublicLayout />}>
                        <Route index element={<Home />} />
                        <Route path="login" element={<Login />} />
                        <Route path="privacy" element={<PrivacyPolicy />} />
                        <Route path="about" element={<About />} />
                    </Route>

                    <Route element={<ProtectedLayout />}>
                        <Route path="import" element={<Import />} />
                        <Route path="preview" element={<Preview />} />
                        <Route path="success" element={<Success />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />

                </Route>
            </Routes>
        </StrictMode>
    </BrowserRouter>
);