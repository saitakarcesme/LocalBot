// A small macOS PTY transport. stdin: type byte + big-endian length + payload.
// Type 1 = terminal input, type 2 = two big-endian uint32 dimensions. stdout is raw PTY output.
#include <util.h>
#include <sys/ioctl.h>
#include <sys/select.h>
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <errno.h>
#include <stdio.h>
static pid_t child = -1;
static int master = -1;
static void stop(int sig) { if (master >= 0) close(master); if(child > 0) kill(child, SIGHUP); _exit(0); }
static int exact(int fd, unsigned char *b, size_t n) { while(n) { ssize_t r=read(fd,b,n); if(r<0&&errno==EINTR)continue; if(r<=0)return 0; b+=r;n-=r; } return 1; }
static int output(int fd, unsigned char *b, size_t n) { while(n) { ssize_t r=write(fd,b,n); if(r<0&&errno==EINTR)continue;if(r<=0)return 0;b+=r;n-=r; }return 1; }
static uint32_t integer(unsigned char *b) { return ((uint32_t)b[0]<<24)|((uint32_t)b[1]<<16)|((uint32_t)b[2]<<8)|b[3]; }
int main(int argc, char **argv) {
 if(argc!=2)return 2;
 struct winsize size={.ws_row=24,.ws_col=80};
 child=forkpty(&master,NULL,NULL,&size);
 if(child<0)return 3;
 if(child==0) { if(chdir(argv[1])!=0)_exit(4);setenv("TERM","xterm-256color",1);execl("/bin/zsh","zsh","-l",NULL);_exit(5); }
 signal(SIGTERM,stop);signal(SIGINT,stop);signal(SIGHUP,stop);signal(SIGPIPE,stop);
 unsigned char data[65536],header[5];
 for(;;){
  fd_set fds;FD_ZERO(&fds);FD_SET(0,&fds);FD_SET(master,&fds);
  if(select(master+1,&fds,NULL,NULL,NULL)<0){if(errno==EINTR)continue;break;}
  if(FD_ISSET(master,&fds)){ssize_t n=read(master,data,sizeof(data));if(n<=0)break;if(!output(1,data,n))break;}
  if(FD_ISSET(0,&fds)){
   if(!exact(0,header,5))break;uint32_t n=integer(header+1);if(n>sizeof(data)||!exact(0,data,n))break;
   if(header[0]==1){if(!output(master,data,n))break;}
   else if(header[0]==2&&n==8){uint32_t cols=integer(data),rows=integer(data+4);if(cols<2||cols>500||rows<2||rows>300)break;size.ws_col=cols;size.ws_row=rows;ioctl(master,TIOCSWINSZ,&size);}
   else break;
  }
 }
 stop(0);return 0;
}
