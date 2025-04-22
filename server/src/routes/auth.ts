import {FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';

async function auth_routes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    fastify.get('/auth/google/callback', async function (request, reply) {
        try {
            const {token} = await this.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
            request.session.googleTokens = {
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                expiresAt: Date.now() + (token.expires_in || 3600) * 1000,
            };
            await request.session.save();
            this.log.info('Google tokens stored in session.');
            return reply.redirect(process.env.CLIENT_BASE_URL + '/import');
        } catch (err: any) {
            this.log.error({err}, "Error in Google OAuth callback");
            return reply.code(500).send({error: 'Authentication failed', message: err.message});
        }
    });

    fastify.get('/auth/logout', async (request, reply) => {
        try {
            if (request.session) {
                await request.session.destroy();
                request.log.info('User session destroyed.');
                reply.clearCookie('sessionId', {path: '/'});
                return reply.redirect(process.env.CLIENT_BASE_URL || '/');
            } else {
                return reply.send({message: 'No active session to log out from.'});
            }
        } catch (err: any) {
            request.log.error({err}, "Logout failed");
            return reply.code(500).send({error: 'Logout failed'});
        }
    });

    fastify.get('/api/me', async (request, reply) => {
        const tokens = request.session?.googleTokens;
        if (!tokens?.accessToken) {
            return reply.code(401).send({error: 'Unauthorized', message: 'No active session found.'});
        }
        if (Date.now() >= tokens.expiresAt) {
            request.log.info('Session token appears expired based on stored time.');
            await request.session?.destroy();
            reply.clearCookie('sessionId', {path: '/'});
            return reply.code(401).send({error: 'Unauthorized', message: 'Session expired. Please log in again.'});
        }
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: {Authorization: `Bearer ${tokens.accessToken}`},
            });
            if (!response.ok) {
                if (response.status === 401) {
                    request.log.warn('Google API returned 401 for userinfo fetch. Invalidating session.');
                    await request.session?.destroy();
                    reply.clearCookie('sessionId', {path: '/'});
                    return reply.code(401).send({
                        error: 'Unauthorized',
                        message: 'Google token rejected. Please log in again.'
                    });
                }
                throw new Error(`Google API error: ${response.status} ${response.statusText}`);
            }
            const userInfo = await response.json();
            return {authenticated: true, user: userInfo};
        } catch (err: any) {
            request.log.error({err}, "Failed to fetch user info from Google");
            return reply.code(500).send({error: 'Failed to fetch user info', message: err.message});
        }
    });

}

export default fp(auth_routes);