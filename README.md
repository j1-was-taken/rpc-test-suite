<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<!--
*** Thanks for checking out the Best-README-Template. If you have a suggestion
*** that would make this better, please fork the repo and create a pull request
*** or simply open an issue with the tag "enhancement".
*** Don't forget to give the project a star!
*** Thanks again! Now go create something AMAZING! :D
-->

<!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/j1-was-taken/rpc-test-suite">
    <img src="images/logo.png" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">RPC Test Suite</h3>

  <p align="center">
    This script provides a suite of tests to evaluate the performance and reliability of different RPC endpoints (gRPC, HTTP, WebSocket) for Web3 applications.
    </p>
</div>

### Built With

- [![Typescript][Typescript]][Typescript-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

To run the tests you need node.js, npm, and tsx

### Prerequisites

- node.js: https://nodejs.org/en/download/package-manager
- npm: should come with nodejs
- tsx

```sh
   npm install -g tsx
```

### Installation

1. Gather your endpoints (HTTP, WEBSOCKET, gRPC)
2. Clone the repo
   ```sh
   git clone https://github.com/j1-was-taken/rpc-test-suite.git
   ```
3. Change directories to the repo
   ```sh
   cd rpc-test-suite
   ```
3. Install NPM packages
   ```sh
   npm install
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

1. Rename the .env_template to .env and fill out the information
   ```sh
   GRPC_URL="https://example_endpoint:example_port"
   HTTP_URL="http://example_endpoint"
   WS_URL="ws://example_endpoint"
   TEST_DURATION=60
   TEST_INTERVAL=5
   ```
   - Test duration: How long do you want to run each test for?
   - Test interval: How long do you want to wait between each test?
2. Enter your terminal and run the below...

```sh
   npx tsx test.ts
```

3. The tests below will then be run outputting the amount of data received and the duration the test was active for...

   - gRPC Stream Test
      - Connects to the gRPC endpoint and listens for transactions where the solana system clock account included (most txs have this account, so you should see a lot)
   - gRPC Calls Test
      - Calls the latest blockhash repeatedly
   - WebSocket Stream Test 
      - Connects to the Websocket endpoint and listens for transactions with the solana system clock account included (most txs have this account, so you should see a lot)
   - HTTP Calls Test
      - Grabs the latest tx signature from the system clock account using the HTTP endpoint repeatedly

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->

## Contact

[@j1_was_taken](https://twitter.com/j1_was_taken)

[https://github.com/j1-was-taken/rpc-test-suite](https://github.com/j1-was-taken/rpc-test-suite)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[contributors-shield]: https://img.shields.io/github/contributors/j1-was-taken/rpc-test-suite.svg?style=for-the-badge
[contributors-url]: https://github.com/j1-was-taken/rpc-test-suite/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/j1-was-taken/rpc-test-suite.svg?style=for-the-badge
[forks-url]: https://github.com/j1-was-taken/rpc-test-suite/network/members
[stars-shield]: https://img.shields.io/github/stars/j1-was-taken/rpc-test-suite.svg?style=for-the-badge
[stars-url]: https://github.com/j1-was-taken/rpc-test-suite/stargazers
[issues-shield]: https://img.shields.io/github/issues/j1-was-taken/rpc-test-suite.svg?style=for-the-badge
[issues-url]: https://github.com/j1-was-taken/rpc-test-suite/issues
[license-shield]: https://img.shields.io/github/license/j1-was-taken/rpc-test-suite.svg?style=for-the-badge
[license-url]: https://github.com/j1-was-taken/rpc-test-suite/blob/master/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/linkedin_username
[product-screenshot]: images/screenshot.png
[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[Typescript]: https://shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=FFF&style=flat-square
[Typescript-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vue.js]: https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D
[Vue-url]: https://vuejs.org/
[Angular.io]: https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white
[Angular-url]: https://angular.io/
[Svelte.dev]: https://img.shields.io/badge/Svelte-4A4A55?style=for-the-badge&logo=svelte&logoColor=FF3E00
[Svelte-url]: https://svelte.dev/
[Laravel.com]: https://img.shields.io/badge/Laravel-FF2D20?style=for-the-badge&logo=laravel&logoColor=white
[Laravel-url]: https://laravel.com
[Bootstrap.com]: https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white
[Bootstrap-url]: https://getbootstrap.com
[JQuery.com]: https://img.shields.io/badge/jQuery-0769AD?style=for-the-badge&logo=jquery&logoColor=white
[JQuery-url]: https://jquery.com
