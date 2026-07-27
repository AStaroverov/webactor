import { createDenseNetwork, useContextMessagePort } from 'webactor';
import { createChatServerActor } from './chat-server-actor';

const network = createDenseNetwork(
  useContextMessagePort(),
  createChatServerActor(),
)

network.launch();
