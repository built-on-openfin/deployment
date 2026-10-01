/* eslint-disable unicorn/no-process-exit */
import { exec } from 'child_process';

/**
 * Run the process.
 * @param url The url to launch.
 */
async function run(url) {
	try {
		if (process.platform === 'win32') {
			exec(`start ${url}`, (error, stdout, stderr) => {
				if (error) {
					console.error(`Error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				console.log(`stdout: ${stdout}`);
			});
		} else if (process.platform === 'darwin') {
			exec(`open ${url}`, (error, stdout, stderr) => {
				if (error) {
					console.error(`Error: ${error.message}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				console.log(`stdout: ${stdout}`);
			});
		}
	} catch (e) {
		console.error(`Error: Connection failed`);
		console.error(e.message);
	}
}

console.log('Launch Url');
console.log('===============');
console.log();
console.log(`Platform: ${process.platform}`);

const launchArgs = process.argv.slice(2);
const url = launchArgs.length > 0 ? launchArgs[0] : 'http://localhost:6060/index.html';
console.log(`Url: ${url}`);

run(url).catch((err) => console.error(err));
