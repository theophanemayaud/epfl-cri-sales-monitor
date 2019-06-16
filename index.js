/* Instructions for use
--- Preparations ---
In order to get this script working, please fill in your credentials in private.json.example
    then rename it to private.json

Also, depending on whether you are on mac, debian, or another platform, you will need a 
    reference image for when there is nothing new on the cri website. For this, either rename 
    one of the existing reference images to nothingNewReference.png or if none match your platform
    (or if the script gives a flase positive when you have chosen one) define one arbitrarily, 
    then run the script and take the latest screenshot where there are no items
    from the screenshots folder, and replace nothingNewReference.png with it. At this point,
    the script should not do any false positives (detect pixel differences when actually there are 
    no new items) !
 --- Running the script ---
 start the script with yarn start
*/

// ====================================== requires ======================================
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");

const schedule = require("node-schedule");

const pixelmatch = require("pixelmatch");
const date = require("date-and-time");

const fs = require("fs");
const PNG = require("pngjs").PNG;
const cmd = require("node-cmd");

var colors = require("colors");
const private = require("./private.json");
//const vpn = require("cisco-vpn")(private.cisco_ids);

// ====================================== vars ======================================
// ==================================================================================
const autoUpdateInterval = 60 * 1000 * 5;
var stdin = process.openStdin();
let keepFetching = true;
const maxFetchesInterval = 60 * 1000 * 5;
const minFetchesInterval = 60 * 1000;
let fetchesTimeIntervals = maxFetchesInterval;
let criPageId = 0;
const screenshotPath = "screenshots/";
//const noNewItemsPath = "nothing_new/";
//const newItemspPath = "new/";
let page;
let browser;
const width = 1000;
const height = 3000;
const diffPixelMax = 1000;
let lastTimeNewItems = false;
const transporter = nodemailer.createTransport({
  // Use an app specific password here
  service: "Gmail",
  auth: {
    user: private.mail_account.user,
    pass: private.mail_account.pass
  }
});
let sendMail = false;

let noItemsScreenshotComparePath = "nothingNewReference.png";
let lastScreenShotPath = noItemsScreenshotComparePath;
let mailText = " There are new items !!!";
let currentScreenShotPath = noItemsScreenshotComparePath;

//========= end vars =====

// ===== used sub functions ===

function readPngPromise(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on("error", err => {
        return reject(err);
      })
      .on("parsed", data => {
        return resolve(data);
      });
  });
}

const checkPage = async () => {
  /*for debugging to see what is being done set headless false and slowmo
    browser = await puppeteer.launch({
    headless: false,
    slowMo: 80,
    args: [`--window-size=${width},${height}`]
  });
  browser = await puppeteer.launch();*/
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }); /* cri website has no malware so it should be ok without sandbox*/
    page = await browser.newPage();
    await page.setViewport({ width: width, height: height });

    var log = console.log;
    let now = new Date();
    let trialId =
      "" + date.format(now, "YY MM DD - HH mm") + " tryId " + criPageId;

    log(trialId + " will fetch page");
    /* test saved new items page
    await page.goto(
      "file:///Users/theophanemayaud/Internet/Funscripts/criVentes/ressources/Matos_dispo_Vente_Materiel.htm",
      {
        timeout: 10000
      }
    );
    */
    await page.goto(
      "http://crisrv1.epfl.ch/fmi/iwp/cgi?-db=Vente_Materiel&-startsession",
      { timeout: 10000 }
    );
    await page.click("#guest-radio");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load" }),
      page.click("#login", { delay: "10" })
    ]);
    log(
      trialId +
        " fully loaded and navigated to sell page, will check for new items"
    );
    currentScreenShotPath = screenshotPath + trialId + " .png";
    await page.screenshot({ path: currentScreenShotPath });
    let numDiffPixels;

    log(trialId + " will load images");

    var lastScreenshot = await readPngPromise(lastScreenShotPath);
    var currentScreenshot = await readPngPromise(currentScreenShotPath);

    log(trialId + " image load succeded, will compare two images");
    var diff = new PNG({ width: 1000, height: 3000 });
    numDiffPixels = pixelmatch(
      lastScreenshot,
      currentScreenshot,
      diff.data,
      1000,
      3000,
      {
        threshold: 0.1
      }
    );
    log(trialId + " numDiffPixels = " + numDiffPixels);

    diff.pack().pipe(fs.createWriteStream("diff.png"));

    /**  2 scenarios
     *    same, no pixels different -> don't send any mails or do anything else.
     *    different -> if lastTimeNewItems false then set it true
     *                        there are new items, send mail, set sendMail
     *                    if lasTimeNewItems true, compare to reference No items
     *                        if different than noitems  reference, send mail
     *                        if same as  no items, se lastTimeNewItems false
     * */

    if (numDiffPixels >= diffPixelMax) {
      // something's changed !!!!
      log(trialId + " something's changed, numDiffPixels = " + numDiffPixels);
      if (lastTimeNewItems === false) {
        // there must be fresh items since there wasn't anything before !
        log(trialId + " there are fresh new items, nothing was here before !");
        mailText =
          trialId + " there are fresh new items, nothing was here before !";
        sendMail = true;
        lastTimeNewItems = true;
      } else {
        // check if something changed because there is again nothing
        numDiffPixels = await pixelmatch(
          noItemsScreenshotComparePath,
          currentScreenShotPath,
          null,
          1000,
          3000,
          {
            threshold: 0.1
          }
        );
        if (numDiffPixels >= diffPixelMax) {
          // New items were added !
          log(trialId + " new items were added to previous ones");
          sendMail = true;
          lastTimeNewItems = true;
        } else {
          // we are back to again nothing  in  the list
          lastTimeNewItems = false;
          log(
            trialId +
              " and... everything's gone, there's nothing anymore... :/ "
          );
        }
      }
    } else {
      // There's just nothing...
      log(
        trialId +
          " and... there's just nothing ... :/ numDiffPixels = " +
          numDiffPixels
      );
    }

    if (sendMail === true) {
      mailNewItemsPhoto(
        trialId,
        " there are new items!!!",
        currentScreenShotPath
      );
    } else {
      console.log(
        trialId + " sendMail was false, will therefore not send mail"
      );
    }
  } catch (error) {
    console.log(
      colors.red("Id : %s - CheckPage general try error : '%s' "),
      criPageId,
      error
    );
  }
  await browser.close();
  criPageId++;
  lastScreenShotPath = currentScreenShotPath;
  fetchesTimeIntervals = Math.floor(
    1 * minFetchesInterval + Math.random() * maxFetchesInterval
  );
  console.log(
    keepFetching +
      " Will fetch again in " +
      Math.floor(fetchesTimeIntervals / 60000) +
      "min"
  );
  if (keepFetching) setTimeout(checkPage, fetchesTimeIntervals);
};

const mailProgramStart = async () => {
  console.log("Will send program started mail".italic);
  await transporter.sendMail(
    {
      from: private.mail_account.from,
      to: private.mail_account.to,
      subject: "The program started !!!",
      text: "The program started !!!"
    },
    (error, info) => {
      if (error) {
        console.log(
          colors.red("There was an error sending start mail, error is : \n %s"),
          error
        );
      } else {
        console.log("Start mail sent successfully !!!".green);
      }
    }
  );
  return;
};

const mailNewItemsPhoto = async (trialId, message, photoPath) => {
  console.log(trialId + " will send new items photo");
  await transporter.sendMail(
    {
      from: private.mail_account.from,
      to: private.mail_account.to,
      subject: trialId + message,
      text: mailText,
      attachments: [
        {
          path: photoPath
        }
      ]
    },
    (error, info) => {
      if (error) {
        console.log(trialId + " There was an error sending mail".red);
        console.log(error);
      } else {
        console.log(trialId + " Mail sent successfully !!!");
      }
    }
  );
  sendMail = false;
};

const autoUpdateScriptGithub = async () => {
  await gitPull();
  await updatePackageDeps();
  console.log(
    colors.italic(
      "Setting %s minutes timer for next git script update from github"
    ),
    autoUpdateInterval / 60000
  );
  setTimeout(autoUpdateScriptGithub, autoUpdateInterval);
  return;
};

const resetInternetConnection = async () => {
  console.log("Will try to reset internet connection");
  cmd.get(
    `
            sudo /etc/init.d/networking restart
            `,
    function(err, data, stderr) {
      if (!err) {
        console.log(
          colors.green("Internet connection reset ok saying : %s"),
          data
        );
        setTimeout(connectVPN, 10000);
      } else {
        console.log(colors.red("Internet connection error : %s"), err);
      }
    }
  );
};

const gitPull = async () => {
  let now = new Date();
  console.log(date.format(now, "YY MM DD - HH mm") + " - Will pull with git");
  try {
    cmd.get(
      `
        git pull
        `,
      function(err, data, stderr) {
        if (!err) {
          console.log("Git pull worked, git said : ".bgCyan + data);
        } else {
          console.log(colors.red("Git pull error : %s"), err);
          resetInternetConnection();
        }
      }
    );
  } catch (error) {
    console.log(
      colors.red("There was an error in gitPull function : %s"),
      error
    );
  }
};

const updatePackageDeps = () => {
  try {
    console.log("Will update package deps");
    cmd.get(`yarn`, function(err, data, stderr) {
      if (!err) {
        console.log(
          colors.green("Package deps update worked saying : %s"),
          data
        );
      } else {
        console.log(colors.red("Package deps update error : %s"), err);
      }
    });
  } catch (error) {
    console.log(colors.red("Package deps update problem : \n'%s'"), error);
  }
};

const connectVPN = async () => {
  try {
    console.log(
      "Will connect to VPN, if no direct error than it is connected !".italic
    );
    cmd.get(
      `
      echo ` +
        private.machine_user_pswd +
        ` | sudo -S notacommand

        echo '` +
        private.epfl_pswd +
        `' | sudo openconnect -b --no-dtls vpn.epfl.ch --user=` +
        private.epfl_user +
        ` --passwd-on-stdin`,
      function(err, data, stderr) {
        if (!err) {
          // will return success only when openconnect process is killed !
          console.log(
            colors.bgBlue(
              "connectVPN return success (meaning VPN connection is closed) : %s"
            ),
            data
          );
        } else {
          console.log(colors.red("openconnect error : %s"), err);
        }
      }
    );
    /*  for windows cisco openconnect only
        await vpn.connect();
        console.log("Cisco anyconnect connected successfully !");
    */
  } catch (error) {
    console.log(colors.red("VPN errror : \n'%s'"), error);
  }
};

const disconnectVPN = () => {
  try {
    cmd.get(
      `
        echo ` +
        private.machine_user_pswd +
        ` | sudo -S notacommand
        sudo pkill -2 openconnect
        `,
      function(err, data, stderr) {
        if (!err) {
          console.log(
            colors.green(
              "OpenConnect vpn stopped and said : %s \n---end to what it said---"
            ),
            data
          );
        } else {
          console.log(colors.red("openconnect error : %s"), err);
        }
      }
    );
    //await vpn.disconnect(); // for windows only
    console.log("VPN disconnected successfully".green);
  } catch (error) {
    console.log(colors.red("VPN disconnect error : %s"), error);
  }
};

const exitProgram = async () => {
  console.log("Good Bye, exiting");
  disconnectVPN();
  process.exit(0);
};

const startDay = () => {
  console.log("Start of day, fetches will start !".bgMagenta);
  keepFetching = true;
  connectVPN();
  setTimeout(checkPage(), 5000); //wait till vpn connected
};

const stopDay = () => {
  console.log("End of day, fetches will stop !".bgMagenta);
  keepFetching = false;
  disconnectVPN();
};
// ====================================== execution ======================================
// ==================================================================================
/*
Cron-style Scheduling for node-schedule
The cron format consists of:

*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, OPTIONAL)
*/
var startJob = schedule.scheduleJob("0 7 * * *", startDay);

var stopJob = schedule.scheduleJob("00 20 * * *", stopDay);

const startProgram = async () => {
  console.log("Bienvenue my friend !!!".bgGreen);
  console.log(
    colors.yellow("New start job will be at : %s"),
    startJob.nextInvocation()
  );
  console.log(
    colors.yellow("New stop job will be at : %s"),
    stopJob.nextInvocation()
  );

  mailProgramStart();
  setTimeout(autoUpdateScriptGithub, 3000); // wait till mail was sent
  setTimeout(connectVPN, 6000);

  setTimeout(() => {
    console.log(
      colors.yellow("Page fetches starting with %s min time intervals :)"),
      Math.floor(fetchesTimeIntervals / 60000)
    );
    checkPage();
  }, 10000); //wait till vpn connected !
};
startProgram();

stdin.addListener("data", function(d) {
  // note:  d is an object, and when converted to a string it will
  // end with a linefeed.  so we (rather crudely) account for that
  // with toString() and then trim()
  switch (d.toString().trim()) {
    case "exit":
      exitProgram();
      break;
    case "start":
      console.log("Starting page fetches :)");
      keepFetching = true;
      checkPage();
      break;
    case "git":
      console.log("Will pull from git");
      gitPull();
      break;
    case "upack":
      updatePackageDeps();
      break;
    case "vpnd":
      console.log("Will disconnect VPN".italic);
      disconnectVPN();
      break;
    case "vpnc":
      connectVPN();
      break;
    case "reseti":
      resetInternetConnection();
      break;
    case "fetch":
      checkPage();
      break;
    case "stop":
      console.log("Stopping page fetches");
      keepFetching = false;
      break;
    default:
      console.log("you entered: [" + d.toString().trim() + "]");
      console.log("It doesn't match any of the standard, following commands :");
      console.log(
        "exit (program), start (fetches), stop (fetches), \n " +
          "vpnd (disconnect VPN), vpnc (connect VPN) \n" +
          "upack (update packages with yarn start), fetch (fetch one page)\n" +
          "git (pull from github), reseti (reset internet connection) \n"
      );
      break;
  }
});
