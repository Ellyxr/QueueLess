import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  handleConnection(@ConnectedSocket() client: Socket) {
    // JWT connection validation and user/vendor rooms are scaffolded next.
    client.disconnect(true);
  }
}