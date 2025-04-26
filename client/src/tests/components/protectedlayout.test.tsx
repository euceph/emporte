import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import ProtectedLayout from '../../components/protectedlayout';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Outlet: () => <div data-testid="mock-outlet">Mock Outlet Content</div>,
        Navigate: ({ to }: { to: string }) => <div data-testid={`mock-navigate-${to}`}>Navigating to {to}</div>,
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

describe('ProtectedLayout', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should display loading spinner initially', () => {
        mockFetch.mockImplementation(() => new Promise(() => {}));

        render(
            <MemoryRouter>
                <ProtectedLayout />
            </MemoryRouter>
        );

        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/login')).not.toBeInTheDocument();
    });

    it('should render Outlet when authentication check succeeds', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

        render(
            <MemoryRouter>
                <ProtectedLayout />
            </MemoryRouter>
        );

        expect(await screen.findByTestId('mock-outlet')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(`${MOCK_SERVER_URL}/api/me`, expect.any(Object));

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-navigate-/login')).not.toBeInTheDocument();
    });

    it('should render Navigate to /login when authentication check fails', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 401 } as Response);

        render(
            <MemoryRouter>
                <ProtectedLayout />
            </MemoryRouter>
        );

        expect(await screen.findByTestId('mock-navigate-/login')).toBeInTheDocument();
        expect(screen.getByText('Navigating to /login')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();
        expect(mockedToast.error).not.toHaveBeenCalled();
    });

    it('should render Navigate to /login and show toast on fetch error', async () => {
        const fetchError = new Error("Network request failed");
        mockFetch.mockRejectedValue(fetchError);

        render(
            <MemoryRouter>
                <ProtectedLayout />
            </MemoryRouter>
        );

        expect(await screen.findByTestId('mock-navigate-/login')).toBeInTheDocument();
        expect(screen.getByText('Navigating to /login')).toBeInTheDocument();

        expect(mockFetch).toHaveBeenCalledTimes(1);

        expect(mockedToast.error).toHaveBeenCalledTimes(1);
        expect(mockedToast.error).toHaveBeenCalledWith(
            "Authentication Check Failed",
            expect.any(Object)
        );

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();
    });

    it('should render Navigate to /login and show toast if server URL is missing', async () => {
        vi.stubEnv('VITE_SERVER_BASE_URL', '');

        render(
            <MemoryRouter>
                <ProtectedLayout />
            </MemoryRouter>
        );

        expect(await screen.findByTestId('mock-navigate-/login')).toBeInTheDocument();
        expect(screen.getByText('Navigating to /login')).toBeInTheDocument();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockedToast.error).toHaveBeenCalledTimes(1);
        expect(mockedToast.error).toHaveBeenCalledWith(
            "Authentication Check Failed",
            expect.objectContaining({
                description: expect.stringContaining("Could not verify your session"),
            })
        );

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-outlet')).not.toBeInTheDocument();

        vi.stubEnv('VITE_SERVER_BASE_URL', MOCK_SERVER_URL);
    });
});