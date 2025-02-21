/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const socketHandler = require('./websockets/socketHandler.js');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

socketHandler(io);

server.listen(3001, () => console.log('Backend running on port 3001'));
