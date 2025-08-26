import { connectActorToMessagePort, onConnectMessagePort } from 'webactor';
import { createChatServerActor } from './chat-server-actor';

const chatServerActor = createChatServerActor();
chatServerActor.launch();

onConnectMessagePort(self, (port) => {
  console.log('New connection to chat server');
  connectActorToMessagePort(chatServerActor, port as any);
});