FROM ubuntu:20.04
LABEL Version 3.2.01
RUN apt-get -y update
# install linux packages
RUN apt install -y \
    curl \
    supervisor \
    rsyslog \
    vim \
    iputils-ping \
    telnet \
    dnsutils \
    net-tools \
    openssh-client \
    rsync \
    sudo

#install node js 14.x
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt install -y nodejs

#install docker-ce-cli
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
RUN echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt update -y ; apt install -y docker-ce-cli

# mark this as docker installation
RUN mkdir -p /etc/.nubo/ && \
    touch  /etc/.nubo/.docker

# install nubo debs
COPY debs /tmp
RUN apt install -y \
    /tmp/nubo-common.deb \
    /tmp/nubomanagement-serv.deb \
    /tmp/nubomanagement-serv-common.deb \
    /tmp/nubomanagement-serv-js.deb \
    /tmp/nubomanagement-serv-node-modules.deb

RUN rm -f /tmp/*.deb


# configure
ADD etc /etc
ADD bin /usr/bin
RUN sed -i /imklog/s/module/#module/ /etc/rsyslog.conf

# Docker config
VOLUME ["/opt/nubomanagement/conf","/opt/nubomanagement/locales","/opt/nubomanagement/docker_apps","/srv/nfs/homes"]
EXPOSE 8443 8080
ENTRYPOINT ["/usr/bin/docker-entrypoint.sh"]
CMD ["supervisord"]
