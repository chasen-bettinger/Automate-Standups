import * as puppeteer from "puppeteer";
import * as $ from "cheerio";
import * as dayjs from "dayjs";
import got from "got";

import { slack } from "./slack";

let isFridayStandup = false;

const getRandomInt = (max) => {
  return Math.floor(Math.random() * Math.floor(max));
};

const isValidDay = () => {
  const today = dayjs().day();
  const validDays = [1, 2, 3, 4, 5];

  return validDays.includes(today);
};

const getStandupDate = () => {
  const today = dayjs().day();
  const isMonday = today === 1;
  let daysAgo = 1;

  if (isMonday) {
    isFridayStandup = true;
    daysAgo = 3;
  }

  return dayjs().subtract(daysAgo, "day").format("YYYY/M/D");
};

(async () => {
  if (!isValidDay()) return;
  const _slack = slack();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const url = "https://id.getharvest.com/harvest/sign_in";

  await page.goto(url, { waitUntil: ["networkidle2"] });

  const navigationPromise = page.waitForNavigation({
    waitUntil: ["networkidle2"],
  });

  await page.waitForSelector('[name="email"]');
  await page.waitForSelector('[name="password"]');

  await page.type('[name="email"]', process.env.harvestU);
  await page.type('[name="password"]', process.env.harvestP);
  await page.click('[type="submit"]');

  await navigationPromise;

  const standupDate = getStandupDate();
  const nextUrl = `https://deviqio.harvestapp.com/time/day/${standupDate}`;
  await page.goto(nextUrl, { waitUntil: ["networkidle2"] });

  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  const $page = $.load(bodyHTML);

  const sows = {};

  try {
    let message = ``;
    const reportedTickets = $page(".day-view-entry-list tbody").find("tr");
    reportedTickets.each(function () {
      const sow = $page(this).find(".project-client .project").text();
      const task = $page(this).find(".task").text();

      if (!sows[sow]) {
        sows[sow] = {};
      }

      let ticket: string = "";

      $page(this)
        .find(".remote-entry-data a p")
        .each(function (i) {
          const isTicket = i === 0;
          const text = $page(this).text();
          if (isTicket) {
            ticket = `${task} - ${text}`;
            sows[sow][ticket] = "";
            return;
          }

          sows[sow][ticket] += `- ${text}\n `;
        });
    });

    const sowMap = new Map(Object.entries(sows));

    let whenText = isFridayStandup ? "On Friday" : "Yesterday";

    sowMap.forEach((tickets, sow) => {
      message += `${whenText}, I worked on: ${sow} \n\n`;

      const ticketMap = new Map(Object.entries(tickets));

      ticketMap.forEach((notes, ticket) => {
        message += `For the ticket: ${ticket} \n\n`;
        message += `Here's what i did: \n ${notes} \n\n`;
      });
    });

    if (message === "") return;

    message += `hours are in baby!!\n\n`;

    const quoteRequest = await got("https://type.fit/api/quotes", {
      responseType: "json",
    });
    if (quoteRequest) {
      const quotes: any = quoteRequest.body;
      const randomInt = getRandomInt(quotes.length);

      const { text, author } = quotes[randomInt];

      message += `Quote of the day: ${text} - ${author} \n\n`;
    }

    await _slack.send(message);
  } finally {
    process.exit(0);
  }
})();
