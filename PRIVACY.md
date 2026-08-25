# Northgate Privacy Policy

Last updated: 25 August 2026  
Publisher: Tyson Greenan · greenantyson@gmail.com

Northgate is a Chrome extension. It is a prompt firewall for ChatGPT. It does not replace ChatGPT and it does not send your text to a Northgate server or to a different model.

## Where it runs

Version 1 runs only on chatgpt.com and chat.openai.com. It does not run on other sites.

## What it reads

On those two hosts, Northgate reads the ChatGPT composer so it can find structured personal information: email addresses, phone numbers, Canadian Social Insurance Numbers, and payment card numbers. Matches are replaced in the composer with tokens such as [EMAIL] or [PHONE]. The first Send is blocked. You review the tokens and press Send again if you want the redacted text to go to ChatGPT.

If you press Send the second time, the redacted prompt goes to OpenAI as part of normal ChatGPT use. Northgate does not receive a copy of that prompt.

## What it stores

Northgate uses Chrome local storage on your device for:

- a local sign-in name
- the client vault you selected
- an activity log of redaction events (time, host, decision, and counts of email / phone / SIN / card matches)

This log stays on the device in V1. Northgate does not sync it to our servers. You can download or clear it from the extension.

## What we do not do

- We do not sell or transfer user data to third parties
- We do not use this data for advertising or credit decisions
- We do not load remote code
- We do not ask for your ChatGPT password

## Permissions

The extension uses the `storage` permission and host access to chatgpt.com and chat.openai.com only. That host access is why Chrome says it can read and change data on those sites.

## Contact

Questions: greenantyson@gmail.com
