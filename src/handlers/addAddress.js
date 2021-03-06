const fetch = require('node-fetch')
const { environment } = require('../environment')
const {
  decodeData,
  encodeData,
  marshallFileUpdate,
  marshallAddressEntry,
} = require('../handler-utils')
const parseAddAddress = require('../parser/addAddress')
const parseWhitelistedRoles = require('../parser/whitelistedRoles')
const { error, log } = require('../utils')

const GITHUB_API_URL = 'https://api.github.com'

module.exports = function addAddress(message) {
  const whitelistedRoles = parseWhitelistedRoles()

  const roleWhitelisted = whitelistedRoles.reduce(
    (whitelisted, role) =>
      message.member.roles.cache.find(r => role === r.name) ||
      role === '*' ||
      whitelisted,
    false,
  )
  if (!roleWhitelisted && whitelistedRoles) {
    message.reply('Your role level is not high enough to access this bot')
    return
  }

  try {
    const address = parseAddAddress(message.content)
    const name = message.author.username
    const discordId = message.author.id
    let userExists = null

    fetch(
      `${GITHUB_API_URL}/repos/${environment('GITHUB_ADDRESS_FILE_PATH')}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${environment('GITHUB_API_TOKEN')}`,
        },
      },
    )
      .then(res => res.json())
      .then(body => {
        const encodedContent = body.content
        const fileSha = body.sha
        log(`fetched file with sha ${fileSha} for user ${name}`)
        // Decode the content from the Github API response, as
        // it's returned as a base64 string.
        const decodedContent = decodeData(encodedContent) // Manipulated the decoded content:
        // First, check if the user already exists.
        userExists = decodedContent.find(
          identity =>
            identity.discordId.toLowerCase() === discordId.toLowerCase(),
        )
        if (userExists) {
          if (userExists.address !== address) {
            const index = decodedContent.indexOf(userExists)
            decodedContent.splice(index, 1)
          } else {
            message.reply('I have that address saved already')
            log('address already exists')
            return
          }
        }
        // If the user is not registered, we can now proceed to mutate
        // the file by appending the user to the end of the array.
        const addressEntry = marshallAddressEntry({ name, address, discordId })
        decodedContent.push(addressEntry)

        // We encode the updated content to base64.
        const updatedContent = encodeData(decodedContent)
        // We prepare the body to be sent to the API.
        const marshalledBody = marshallFileUpdate({
          message: 'Update addressbook.json',
          content: updatedContent,
          sha: fileSha,
        })
        // And we update the project.json file directly.
        fetch(
          `${GITHUB_API_URL}/repos/${environment('GITHUB_ADDRESS_FILE_PATH')}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${environment('GITHUB_API_TOKEN')}`,
            },
            body: marshalledBody,
          },
        ).then(() => {
          if (userExists && userExists.address !== address) {
            message.reply(
              `I changed \`${userExists.address}\` to \`${address}\` for you, ${name} `,
            )
            log(`Detected ID ${discordId} already exists for user ${name}`)
          } else {
            log('Updated file on GitHub successfully.')
            message.reply('Updated the address book successfully!')
          }
        })
      })
      .catch(err => {
        error(err)
        message.reply(
          'Something went wrong while executing the command. Please try again in a few minutes.',
        )
      })
  } catch (err) {
    log(error)
    message.reply(
      'Command parsing failed. Please use the !she help command to see how to use the requested command properly.',
    )
  }
}
