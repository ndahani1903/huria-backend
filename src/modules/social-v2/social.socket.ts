// src/modules/social-v2/social.socket.ts

import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import redis from "../../config/redis";
import { SOCKET_EVENTS } from "./social.constants";

const onlineUsers = new Map<string, string>();

export class SocialSocket {

    static initialize(io: Server) {

        io.on("connection", (socket: Socket) => {

            /**
             * Authenticate
             */
            socket.on("social:join", async ({ token }) => {

                try {

                    const decoded: any = jwt.verify(
                        token,
                        process.env.JWT_SECRET!
                    );

                    const userId = decoded.id;

                    socket.data.userId = userId;

                    onlineUsers.set(userId, socket.id);

                    socket.join(`user:${userId}`);

                    if (redis) {
                        await redis.set(
                            `social:online:${userId}`,
                            socket.id,
                            "EX",
                            120
                        );
                    }

                    io.emit(
                        SOCKET_EVENTS.USER_ONLINE,
                        {
                            userId
                        }
                    );

                    console.log(`🟢 Social User Online ${userId}`);

                } catch (err) {

                    socket.disconnect(true);

                }

            });

            /**
             * Typing
             */

            socket.on("chat:typing", ({ conversationId }) => {

                const userId = socket.data.userId;

                if (!userId) return;

                socket.to(`conversation:${conversationId}`).emit(

                    SOCKET_EVENTS.TYPING,

                    {

                        conversationId,

                        userId

                    }

                );

            });

            /**
             * Stop typing
             */

            socket.on("chat:stopTyping", ({ conversationId }) => {

                const userId = socket.data.userId;

                if (!userId) return;

                socket.to(`conversation:${conversationId}`).emit(

                    SOCKET_EVENTS.STOP_TYPING,

                    {

                        conversationId,

                        userId

                    }

                );

            });

            /**
             * Join Conversation
             */

            socket.on(

                "conversation:join",

                ({ conversationId }) => {

                    socket.join(`conversation:${conversationId}`);

                }

            );

            /**
             * Leave Conversation
             */

            socket.on(

                "conversation:leave",

                ({ conversationId }) => {

                    socket.leave(`conversation:${conversationId}`);

                }

            );

            /**
             * Read receipts
             */

            socket.on(

                "message:read",

                ({ conversationId, messageId }) => {

                    const userId = socket.data.userId;

                    socket.to(

                        `conversation:${conversationId}`

                    ).emit(

                        SOCKET_EVENTS.MESSAGE_READ,

                        {

                            userId,

                            messageId,

                            conversationId

                        }

                    );

                }

            );

            /**
             * Disconnect
             */

            socket.on("disconnect", async () => {

                const userId = socket.data.userId;

                if (!userId) return;

                onlineUsers.delete(userId);

                if (redis) {

                    await redis.del(

                        `social:online:${userId}`

                    );

                }

                io.emit(

                    SOCKET_EVENTS.USER_OFFLINE,

                    {

                        userId

                    }

                );

                console.log(`🔴 Social User Offline ${userId}`);

            });

        });

    }

    /**
     * Send notification
     */

    static emitNotification(

        io: Server,

        userId: string,

        payload: any

    ) {

        io.to(

            `user:${userId}`

        ).emit(

            SOCKET_EVENTS.NEW_NOTIFICATION,

            payload

        );

    }

    /**
     * Send new message
     */

    static emitMessage(

        io: Server,

        conversationId: string,

        payload: any

    ) {

        io.to(

            `conversation:${conversationId}`

        ).emit(

            SOCKET_EVENTS.MESSAGE,

            payload

        );

    }

    /**
     * New Post
     */

    static emitPost(

        io: Server,

        payload: any

    ) {

        io.emit(

            SOCKET_EVENTS.NEW_POST,

            payload

        );

    }

    /**
     * New Comment
     */

    static emitComment(

        io: Server,

        postId: string,

        payload: any

    ) {

        io.to(

            `post:${postId}`

        ).emit(

            SOCKET_EVENTS.NEW_COMMENT,

            payload

        );

    }

    /**
     * Like
     */

    static emitLike(

        io: Server,

        postId: string,

        payload: any

    ) {

        io.to(

            `post:${postId}`

        ).emit(

            SOCKET_EVENTS.NEW_LIKE,

            payload

        );

    }

}