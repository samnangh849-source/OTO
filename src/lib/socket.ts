import { io } from 'socket.io-client';

const socket = io('/', {
  autoConnect: false,
  auth: (cb) => {
    cb({
      token: localStorage.getItem('token')
    });
  }
});

export default socket;
