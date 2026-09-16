import {homedir} from 'node:os';
import {join} from 'node:path';
export function appBuildPath(){
 return join(process.env.LOCALBOT_APP_BUILD_DIR??join(homedir(),'Library/Caches/LocalBot/AppBuild'),'LocalBot.app');
}
