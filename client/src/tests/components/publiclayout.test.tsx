import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import PublicLayout from '../../components/publiclayout';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Outlet: () => <div data-testid="mock-outlet">Mock Public Page Content</div>,
        Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
            <div data-testid={`mock-navigate-${to}`}>Navigating to {to}{replace ? ' (replace)' : ''}</div>
        ),
    };
});

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));
import { toast } from 'sonner';
const mockedToast = vi.mocked(toast);

const MOCK_SERVER_URL = 'http://mock.server.test';
vi.stubEnv('VITE_SERVER_BASE_URL', MOCK_SERVER_URL);

describe('PublicLayout', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        consoleErrorSpy.mockRestore();
    });

    it('should display loading spinner initially', () => {
        mockFetch.mockImplementation(() => new Promise(() => {}));
        render(<MemoryRouter><PublicLayout /></MemoryRouter>);

        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/import')).not.toBeInTheDocument();
    });

    it('should render Navigate to /import when authentication check succeeds', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
        render(<MemoryRouter><PublicLayout /></MemoryRouter>);

        const navigateElement = await screen.findByTestId('mock-navigate-/import');
        expect(navigateElement).toBeInTheDocument();
        expect(screen.getByText('Navigating to /import (replace)')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(`${MOCK_SERVER_URL}/api/me`, expect.any(Object));
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should render Outlet when authentication check fails (e.g. 401)', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 401 } as Response);
        render(<MemoryRouter><PublicLayout /></MemoryRouter>);

        expect(await screen.findByTestId('mock-outlet')).toBeInTheDocument();
        expect(screen.getByText('Mock Public Page Content')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/import')).not.toBeInTheDocument();
        expect(mockedToast.error).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should render Outlet and log error on fetch error', async () => {
        const fetchError = new Error("API is down");
        mockFetch.mockRejectedValue(fetchError);
        render(<MemoryRouter><PublicLayout /></MemoryRouter>);

        expect(await screen.findByTestId('mock-outlet')).toBeInTheDocument();
        expect(screen.getByText('Mock Public Page Content')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("PublicLayout: Error during auth check:", fetchError);
        expect(mockedToast.error).not.toHaveBeenCalled();
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/import')).not.toBeInTheDocument();
    });

    it('should render Outlet and log error if server URL is missing', async () => {
        vi.stubEnv('VITE_SERVER_BASE_URL', '');
        render(<MemoryRouter><PublicLayout /></MemoryRouter>);

        expect(await screen.findByTestId('mock-outlet')).toBeInTheDocument();
        expect(screen.getByText('Mock Public Page Content')).toBeInTheDocument();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("PublicLayout: Error during auth check:", expect.any(Error));
        expect(mockedToast.error).not.toHaveBeenCalled();
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/import')).not.toBeInTheDocument();

        vi.stubEnv('VITE_SERVER_BASE_URL', MOCK_SERVER_URL);
    });
});